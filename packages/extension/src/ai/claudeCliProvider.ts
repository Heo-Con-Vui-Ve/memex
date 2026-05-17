import { stream as rpcStream } from "../lib/rpc";
import type { AiProvider } from "./provider";

export const claudeCliProvider: AiProvider = {
  name: "claude-cli",
  stream({ mode, prompt, onChunk, onDone, onError }) {
    return rpcStream(
      { type: "claude.invoke", payload: { mode, prompt } },
      {
        onChunk: (text) => onChunk(text),
        onDone: () => onDone(),
        onError: (code, message) => onError(code, message),
      },
    );
  },
};
