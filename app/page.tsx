'use client';

import React, { useState, useCallback, useEffect, useRef, DragEvent } from 'react';
import { FileEntry, FileStatus, SEARCH_TERMS } from '@/types';

const MAX_CONCURRENT = 1;

type SortField = 'relevant';

// Decode HTML entities then strip tags — applied to extracted excerpts
function cleanHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip TDA disclaimer paragraph and return the remaining body.
function stripDisclaimer(raw: string): string {
  const dIdx = raw.search(/Disclaimer:\s*This file is generated using OCR/i);
  if (dIdx === -1) return raw;
  const nnIdx = raw.indexOf('\n\n', dIdx);
  if (nnIdx !== -1) return raw.slice(nnIdx + 2);
  const nIdx = raw.indexOf('\n', dIdx);
  return nIdx !== -1 ? raw.slice(nIdx + 1) : '';
}

function prepareContent(raw: string): string {
  const body = stripDisclaimer(raw);
  const header = `<document_header>\n${cleanHtml(body.slice(0, 500))}\n</document_header>`;

  const positions: number[] = [];
  for (const re of [
    /<span\s+class="hitHighlite">/g,
    /&lt;span\s+class=&quot;hitHighlite&quot;&gt;/g,
    /hitHighlite/g,
  ]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) positions.push(m.index);
  }

  if (positions.length === 0) {
    return `${header}\n\n<full_text>\n${cleanHtml(body)}\n</full_text>`;
  }

  positions.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const pos of positions) {
    if (unique.length === 0 || pos - unique[unique.length - 1] > 1500) unique.push(pos);
  }

  const contexts = unique
    .map((pos, i) => {
      const ctx = body.slice(Math.max(0, pos - 1500), Math.min(body.length, pos + 1500));
      return `<highlighted_context index="${i + 1}">\n${cleanHtml(ctx)}\n</highlighted_context>`;
    })
    .join('\n\n');

  return `${header}\n\n<highlighted_contexts>\n${contexts}\n</highlighted_contexts>`;
}

function extractDocumentOpening(raw: string): string {
  const body = stripDisclaimer(raw).trimStart();
  const cleaned = cleanHtml(body.slice(0, 300));
  return cleaned.split(/\s+/).slice(0, 15).join(' ');
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export default function Home() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [date, setDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [isDragging, setIsDragging] = useState(false);
  const [exportYesOnly, setExportYesOnly] = useState(false);
  const [queueTick, setQueueTick] = useState(0);

  const claimedIds = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('mistral_api_key');
    if (stored) setApiKey(stored);
  }, []);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    if (value) {
      sessionStorage.setItem('mistral_api_key', value);
    } else {
      sessionStorage.removeItem('mistral_api_key');
    }
  };

  const analyseFile = useCallback(async (
    fileId: string,
    content: string,
    term: string,
    fileDate: string,
    key: string,
  ): Promise<void> => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'processing' } : f));
    const requestStart = Date.now();
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, searchTerm: term, date: fileDate, apiKey: key }),
      });

      if (res.status === 429) {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'rate-limited' } : f
        ));
        return;
      }

      const data = await res.json();
      if (res.ok) {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'done', result: data } : f
        ));
      } else {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error', error: data.error ?? 'API error' } : f
        ));
      }
    } catch {
      setFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'error', error: 'Network error' } : f
      ));
    } finally {
      const elapsed = Date.now() - requestStart;
      const remaining = Math.max(0, 15000 - elapsed);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
  }, []);

  useEffect(() => {
    const queued = files.filter(f => f.status === 'queued' && !claimedIds.current.has(f.id));
    const slots = MAX_CONCURRENT - claimedIds.current.size;
    if (slots <= 0 || queued.length === 0) return;
    queued.slice(0, slots).forEach(f => {
      claimedIds.current.add(f.id);
      analyseFile(f.id, f.content, f.searchTerm, f.date, apiKey).finally(() => {
        claimedIds.current.delete(f.id);
        setQueueTick(t => t + 1);
      });
    });
  }, [files, analyseFile, queueTick, apiKey]);

  const handleFileList = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list).filter(f => f.name.toLowerCase().endsWith('.txt'));
    if (!arr.length) return;
    const newEntries: FileEntry[] = await Promise.all(
      arr.map(async (file): Promise<FileEntry> => {
        const raw = await file.text();
        return {
          id: crypto.randomUUID(),
          filename: file.name,
          status: 'queued',
          searchTerm,
          date,
          content: prepareContent(raw),
          documentOpening: extractDocumentOpening(raw),
        };
      })
    );
    setFiles(prev => [...prev, ...newEntries]);
  }, [searchTerm, date]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileList(e.dataTransfer.files);
  }, [handleFileList]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleClear = () => {
    setFiles([]);
    claimedIds.current.clear();
  };

  const retryFile = useCallback((fileId: string) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'queued', error: undefined } : f
    ));
  }, []);

  const sortedFiles = !sortField
    ? files
    : [...files].sort((a, b) => {
        const av = a.result?.relevant ?? '';
        const bv = b.result?.relevant ?? '';
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });

  const completedFiles = files.filter(f => f.status === 'done' && f.result);
  const hasResults = completedFiles.length > 0;
  const exportFiles = exportYesOnly
    ? completedFiles.filter(f => f.result?.relevant === 'Yes')
    : completedFiles;

  const HEADERS = [
    'Relevant', 'Title', 'Topic', 'First Words', 'First Words of Document', 'Name of Individual', 'Date', 'Search Term',
  ];

  const rowValues = (f: FileEntry): string[] => {
    const r = f.result!;
    return [
      r.relevant,
      r.title,
      r.short_summary,
      r.first_words,
      f.documentOpening,
      r.name_of_individual,
      f.date,
      f.searchTerm,
    ];
  };

  const handleExportCSV = () => {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      HEADERS.map(esc).join(','),
      ...exportFiles.map(f => rowValues(f).map(esc).join(',')),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wxda-results-${exportYesOnly ? 'YES-' : ''}${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyTSV = async () => {
    const lines = [
      HEADERS.join('\t'),
      ...exportFiles.map(f => rowValues(f).join('\t')),
    ].join('\n');
    await navigator.clipboard.writeText(lines);
  };

  const tableColumns: { label: string; sortable?: SortField }[] = [
    { label: 'Relevant', sortable: 'relevant' },
    { label: 'Title' },
    { label: 'Topic' },
    { label: 'First Words' },
    { label: 'First Words of Document' },
    { label: 'Name of Individual' },
    { label: 'Date' },
    { label: 'Search Term' },
    { label: 'Status' },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">

      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <h1 className="font-semibold text-base tracking-tight">WXDA Analyser</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!hasResults}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={handleCopyTSV}
            disabled={!hasResults}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Copy TSV
          </button>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">

        <div className="flex flex-wrap gap-3 items-end mb-6">
          <div className="flex-1 min-w-[260px] max-w-sm">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Mistral API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => handleApiKeyChange(e.target.value)}
              placeholder="Paste your Mistral API key"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-gray-400"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Publication Date
            </label>
            <input
              type="text"
              value={date}
              onChange={e => setDate(e.target.value)}
              placeholder="e.g. 7 Jan 1856"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div className="flex-1 min-w-[220px] max-w-lg">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Search Term Used
            </label>
            <select
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="">— select search term —</option>
              {SEARCH_TERMS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Clear results
          </button>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDragEnd={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'mb-8 border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all',
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100',
          ].join(' ')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) handleFileList(e.target.files);
              e.target.value = '';
            }}
          />
          <svg
            className="mx-auto mb-3 h-8 w-8 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-gray-600 text-sm font-medium">
            {isDragging
              ? 'Drop .txt files here'
              : 'Drag and drop .txt files here, or click to browse'}
          </p>
          <p className="text-gray-400 text-xs mt-1.5">
            Accepts multiple TDA OCR text exports · HTML tags are stripped automatically
          </p>
        </div>

        {files.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">
                {completedFiles.length}/{files.length} processed
              </p>
              {hasResults && (
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exportYesOnly}
                    onChange={e => setExportYesOnly(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Export Yes only
                </label>
              )}
            </div>

            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm border-collapse min-w-[1200px]">

                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {tableColumns.map(({ label, sortable }) => (
                      <th
                        key={label}
                        onClick={sortable ? () => handleSort(sortable) : undefined}
                        className={[
                          'px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap',
                          sortable ? 'cursor-pointer select-none hover:text-gray-900' : '',
                        ].join(' ')}
                      >
                        {label}
                        {sortable && sortField === sortable && (
                          <span className="ml-1 text-gray-400">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {sortedFiles.map((file, i) => {
                    const r = file.result;
                    const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                    const borderColor =
                      r?.relevant === 'Yes'          ? 'border-l-green-500' :
                      r?.relevant === 'No'           ? 'border-l-red-400'   :
file.status === 'rate-limited' ? 'border-l-amber-400' :
                      'border-l-gray-200';

                    return (
                      <tr
                        key={file.id}
                        className={[
                          'border-b border-gray-100 border-l-4',
                          borderColor,
                          rowBg,
                          'transition-colors',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r?.relevant === 'Yes' && (
                            <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                              Yes
                            </span>
                          )}
                          {r?.relevant === 'No' && (
                            <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                              No
                            </span>
                          )}
                        </td>
                        <td
                          className="px-3 py-2 max-w-[180px] truncate text-gray-700 text-xs font-medium"
                          title={r?.title}
                        >
                          {r?.title}
                        </td>
                        <td
                          className="px-3 py-2 max-w-[260px] truncate text-gray-700 text-xs"
                          title={r?.short_summary}
                        >
                          {r?.short_summary}
                        </td>
                        <td
                          className="px-3 py-2 max-w-[180px] truncate text-gray-500 text-xs italic"
                          title={r?.first_words}
                        >
                          {r?.first_words}
                        </td>
                        <td
                          className="px-3 py-2 max-w-[160px] truncate text-gray-400 text-xs"
                          title={file.documentOpening}
                        >
                          {file.documentOpening}
                        </td>
                        <td className="px-3 py-2 text-gray-700 text-xs whitespace-nowrap">
                          {r?.name_of_individual}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                          {file.date}
                        </td>
                        <td
                          className="px-3 py-2 max-w-[140px] truncate text-gray-500 text-xs"
                          title={file.searchTerm}
                        >
                          {file.searchTerm}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <StatusCell
                            status={file.status}
                            error={file.error}
                            onRetry={() => retryFile(file.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatusCell({ status, error, onRetry }: {
  status: FileStatus;
  error?: string;
  onRetry?: () => void;
}) {
  if (status === 'queued') {
    return <span className="text-xs text-gray-400">Queued</span>;
  }
if (status === 'rate-limited') {
    return (
      <span className="flex items-center gap-2">
        <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
          Rate limited
        </span>
        {onRetry && (
          <button
            onClick={e => { e.stopPropagation(); onRetry(); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Retry later
          </button>
        )}
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-blue-600">
        <svg
          className="animate-spin h-3 w-3 shrink-0"
          viewBox="0 0 24 24" fill="none" aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Processing
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-2">
        <span className="text-xs text-red-600 cursor-help" title={error}>Error</span>
        {onRetry && (
          <button
            onClick={e => { e.stopPropagation(); onRetry(); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Retry
          </button>
        )}
      </span>
    );
  }
  return <span className="text-xs text-green-700">Done</span>;
}