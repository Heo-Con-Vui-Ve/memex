import type { AiMode } from "./protocol.js";

interface ModeSpec {
  label: string;
  systemHint: string;
  defaultPromptTemplate: (noteBody: string) => string;
}

export const MODE_SPECS: Record<AiMode, ModeSpec> = {
  summarize: {
    label: "Summarize",
    systemHint:
      "You produce concise, structured summaries with the key points first.",
    defaultPromptTemplate: (body) =>
      `Summarize the following note in 5 bullets, preserving any concrete action items.\n\n---\n${body}\n---`,
  },
  organize: {
    label: "Organize",
    systemHint: "You rewrite messy notes into clean structured markdown.",
    defaultPromptTemplate: (body) =>
      `Rewrite the following raw note as clean structured markdown with headings, bullets, and a short TL;DR at the top.\n\n---\n${body}\n---`,
  },
  brainstorm: {
    label: "Brainstorm",
    systemHint: "You expand thoughts with fresh angles and adjacent ideas.",
    defaultPromptTemplate: (body) =>
      `Brainstorm 10 fresh angles, follow-up questions, or adjacent ideas grounded in this note.\n\n---\n${body}\n---`,
  },
  improve: {
    label: "Improve writing",
    systemHint:
      "You preserve the author's voice and intent while improving clarity.",
    defaultPromptTemplate: (body) =>
      `Improve the writing of the following note. Preserve voice and intent. Return only the rewritten markdown.\n\n---\n${body}\n---`,
  },
  "extract-tasks": {
    label: "Extract tasks",
    systemHint: "You extract actionable tasks with owners and deadlines.",
    defaultPromptTemplate: (body) =>
      `Extract every actionable task from this note as a markdown checklist. Include owner and deadline if mentioned.\n\n---\n${body}\n---`,
  },
  research: {
    label: "Research assistant",
    systemHint:
      "You answer questions using only the provided note as grounding.",
    defaultPromptTemplate: (body) =>
      `Act as a research assistant grounded in this note. Identify the open questions and what to investigate next.\n\n---\n${body}\n---`,
  },
};

/** MVP only wires "summarize"; the rest are stubbed for Phase 2. */
export const MVP_ENABLED_MODES: AiMode[] = ["summarize"];
