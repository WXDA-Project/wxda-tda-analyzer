export type FileStatus = 'queued' | 'processing' | 'done' | 'error' | 'rate-limited';

export type AnalysisResult = {
  relevant: 'Yes' | 'No';
  title: string;
  short_summary: string;
  first_words: string;
  name_of_individual: string;
};

export type FileEntry = {
  id: string;
  filename: string;
  status: FileStatus;
  searchTerm: string;
  date: string;
  content: string;
  documentOpening: string;
  result?: AnalysisResult;
  error?: string;
};

export const SEARCH_TERMS = [
  'appa?e? NOT wearing',
  'attire',
  'clo!th!? NOT cloths NOT fire NOT flames NOT money NOT cloth',
  'dress NOT address NOT dregs',
  'garb',
  'pett?coat?',
  'breeche?',
  'masque?ade! OR mafque?ade! OR marque?ade! OR matque?ade!',
  'amazon!',
  'disgui?e* OR difgui?e* OR dirgui?e* OR ditgui?e*',
  'dre??ed NOT well NOT dreaded',
  'heroine!',
  'page (only for theatre news)',
  'mascu?ine OR mafcu?ine OR marcu?ine OR matcu?ine',
  'effemin*',
  'sex NOT fair NOT age',
  'female NOT nobility NOT servant NOT population',
  'male NOT make NOT made NOT population NOT issue',
  'feminine',
  'amazonian!',
  "(man's OR men's OR male OR female OR woman's) AND (clothes OR cloaths OR cloths OR apparel OR attire)",
] as const;
