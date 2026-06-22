import { NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { MistralError } from '@mistralai/mistralai/models/errors/mistralerror.js';

const MODEL = 'mistral-large-2512';

const SYSTEM_PROMPT = `You catalogue historical newspaper articles for the Waterloo Cross-Dressing Archive (WXDA).

SCANNING INSTRUCTION — these articles are often long newspaper compilations or war dispatches containing many unrelated items. Read the ENTIRE text carefully, sentence by sentence. Do not skim, summarise, or characterise the article by its dominant subject. A single relevant sentence anywhere — even deep in the article, even as a brief aside — is sufficient for relevant=”Yes”. Cross-dressing references are frequently incidental remarks within longer unrelated narratives (military reports, obituaries, court proceedings, etc.). You must find them.

GENDER FROM CONTEXT — when a group's gender is not explicitly stated but is unambiguous from context (e.g. soldiers in a military dispatch described as men throughout, a named woman in an obituary, performers identified with gendered honorifics), treat that gender as established and apply it when evaluating what they are described wearing. Men putting on women's clothing — whether for amusement, mockery, looting, disguise, or any other reason — counts. A woman wearing any item identified as belonging to or made for men counts, including footwear.

The WXDA uses a deliberately broad definition. Mark relevant=”Yes” if any part of the article describes a person wearing any item of clothing or footwear associated with the opposite sex — regardless of intent, reason, or degree. This includes poverty-driven clothing choices, practical substitutions, looting, amusement, theatrical performance, and deliberate disguise equally. Do not apply a narrow definition requiring intentional gender deception. When in doubt, prefer “Yes” — a human researcher will review. This includes:

- A person wearing, borrowing, or being described as wearing any item of clothing or footwear of the opposite sex — boots, coats, trousers, gowns, caps, etc. — including archaic terms (habit, attire, garb, weeds, vestments) — even a single item, even for practical reasons, even without any “disguise” framing
- A person presented as, passing as, or perceived as a member of the opposite sex through clothing
- A person’s gender is stated or clear AND they are described as wearing any item of clothing associated with another gender
- Theatrical cross-dressing: a performer of one gender playing a character of another gender (breeches roles, a woman playing a male character, a man playing a female character) — a performer–character gender mismatch is sufficient; explicit clothing description is not required
- Religious, moral, legal, or satirical discussion of cross-dressing as a practice, including references to biblical or legal prohibitions against it
- Anecdotes or humorous stories in which someone wears the clothing of another gender

DO NOT mark “Yes” for:
- idioms or metaphorical uses where clothing has lost its literal meaning (e.g., “wears the breeches” meaning dominance)
- fashion descriptions without gender inversion
- normal clothing (women in dresses/gowns, men in suits/uniforms)
- non-clothing uses of “dress” (food, medical, routine dressing)
- references so vague or metaphorical that no reasonable reading suggests gender disguise
- inferred cross-dressing (non-theatrical articles only): for non-theatrical articles, the text must directly state or show that cross-dressing occurred; inference is permitted only when a person's gender is stated or clear AND opposite-sex clothing is explicitly described AND the context indicates disguise, impersonation, arrest, or gender passing. For theatrical articles, use the Step 1/2/3 process below exclusively — this rule does not apply to theatrical cases
- the mere presence of theatrical costumes, wardrobe, or props — do not infer that any performance took place, that any specific person wore any costume, or that cross-dressing occurred, from the discovery of costumes alone; finding costumes for roles of one gender does not imply anyone played roles of the other gender
- a costume described as “effeminate” or “masculine” worn by a performer playing a character of their own gender — the character must be of the opposite sex to the performer, not merely styled in a way associated with the opposite sex
- for theatrical cases: a performer–character gender mismatch requires both performer gender AND character gender to be established; do not speculate about character gender

Theatrical sources include not only reviews and playbills but also epilogues, prologues, benefit notices, and any text that names a real performer alongside a character or role — including texts written in the voice of a character but attributed to a named performer in the header or byline. When a text states that it was "spoken by [performer] in the character of [role]" or equivalent, treat that as a direct performer–character pairing and apply the steps below.

For theatrical cases, work through the article systematically:
Step 1 — List every performer mentioned with their honorific: Miss / Mrs. / Mme. / Mademoiselle = female; Mr. / Master = male.
Step 2 — For each performer, identify the character or role they play and determine that character's gender. Use all available evidence in this order of priority:
  (a) Explicit gendered language attached to the character in the article (pronouns, "hero"/"heroine", "the singing hero and the dancing heroine", etc.)
  (b) The character's name or role title — apply your knowledge of historical European naming conventions and theatrical conventions to judge whether a given name or role title is conventionally male or female in the period and culture of the play. This includes given names, noble titles, occupational roles, and mythological or religious figures.
  (c) Anything else in the article that reveals who this character is — treat the article as a whole. Plot descriptions, synopses, the work's title, references to earlier productions, and any other contextual information can all establish a character's gender even when that information appears far from the performer's name. In particular: if the article describes an earlier or original production in which a male performer played the same role, that role is male even if the current production assigns it a neutral title. If a character is described as a god, divine figure, or mythological being, apply your knowledge of that figure's gender. If a character is described as paired with or taking "the heroine," "the one perfect woman," or a female counterpart, that character is male.
  If none of the above establishes gender with reasonable confidence, treat it as unknown and do not infer cross-dressing.
Step 3 — Flag any performer–character pair where the performer's gender (from Step 1) differs from the character's gender (from Step 2). That is a theatrical cross-dressing case.

If the article clearly falls into one of the DO NOT mark “Yes” categories above → mark “No”.
If genuinely uncertain but there is a plausible reading in which cross-dressing occurred → mark “Yes”.
Only mark “No” when you are confident the article does not describe cross-dressing.

-------------------------------------------- OCR RULES --------------------------------------------
Output must be clean, natural English. You must correct obvious OCR errors using context, but:
- do NOT change meaning
- do NOT invent evidence
- if unsure, keep original wording rather than guessing
- never annotate corrections

-------------------------------------------- OUTPUT FIELDS --------------------------------------------
reasoning — Work through your analysis here FIRST before filling any other field. For theatrical articles: list each performer with their honorific-derived gender, the character they play, how you determined the character's gender (role title, name, article context, or explicit labels like “hero”/”heroine”), and whether there is a mismatch. For non-theatrical articles: briefly note why the article does or does not describe cross-dressing.
relevant — “Yes” or “No”
title — OCR-corrected headline or “”
short_summary — Brief description of the cross-dressing case, including a direct quote from the text where the OCR permits; otherwise “”
first_words — The first sentence that states the cross-dressing instance (not necessarily the first words of the article); or “” if not applicable
name_of_individual — Primary person involved if clearly stated; otherwise “”
`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, searchTerm, date, apiKey } = body as {
      text: unknown;
      searchTerm: unknown;
      date: unknown;
      apiKey: unknown;
    };

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid text field' }, { status: 400 });
    }

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ error: 'No API key provided' }, { status: 400 });
    }

    const client = new Mistral({ apiKey: apiKey.trim() });

    const userMessage =
      `<metadata>\n` +
      `Search term used to find this article: ${searchTerm || 'Not specified'}\n` +
      `Date provided by researcher: ${date || 'Not provided'}\n` +
      `</metadata>\n\n` +
      `<article>\n${text.slice(0, 200_000)}\n</article>`;

    const chatResponse = await client.chat.complete({
      model: MODEL,
      temperature: 0.15,
      maxTokens: 2000,
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'wxda_analysis',
          strict: true,
          schemaDefinition: {
            type: 'object',
            additionalProperties: false,
            required: ['reasoning', 'relevant', 'title', 'short_summary', 'first_words', 'name_of_individual'],
            properties: {
              reasoning:           { type: 'string' },
              relevant:            { type: 'string', enum: ['Yes', 'No'] },
              title:               { type: 'string' },
              short_summary:       { type: 'string' },
              first_words:         { type: 'string' },
              name_of_individual:  { type: 'string' },
            },
          },
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const content = chatResponse.choices?.[0]?.message?.content;
    const raw = (
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('')
          : ''
    ).trim();

    try {
      return NextResponse.json(JSON.parse(raw));
    } catch {
      console.error('[analyse] parse_error — raw response:', raw);
      return NextResponse.json({ error: 'parse_error', raw }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof MistralError && err.statusCode === 429) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Mistral rate limit exceeded' },
        { status: 429 },
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[analyse] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
