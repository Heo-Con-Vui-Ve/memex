// Markdown editor surface. Currently a styled <textarea>; CodeMirror 6 swap
// lands in Batch B. The contract (value/onChange) is stable so the swap is
// purely additive.

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function MarkdownEditor({ value, onChange }: Props) {
  return (
    <textarea
      className="editor-body"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Start typing…"
      spellCheck={false}
    />
  );
}
