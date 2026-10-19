"use client"

import { yaml as yamlLang } from "@codemirror/lang-yaml"
import CodeMirror from "@uiw/react-codemirror"
import { useTheme } from "next-themes"

/** Loaded lazily: CodeMirror only ships to admins who open the editor. */
export default function MetricsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { resolvedTheme } = useTheme()
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[yamlLang()]}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
      aria-label="Semantic layer YAML"
      className="overflow-hidden rounded-md border text-[13px]"
      minHeight="320px"
      maxHeight="60vh"
    />
  )
}
