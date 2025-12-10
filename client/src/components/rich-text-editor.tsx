import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Code,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  Heading3,
  RemoveFormatting,
  Quote,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string, plainText: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Type your message...",
  minHeight = "120px",
  maxHeight = "400px",
  className = "",
  disabled = false,
  autoFocus = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      // Sanitize HTML to prevent XSS - only allow safe formatting tags
      const sanitized = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=/gi, 'data-blocked=')
        .replace(/javascript:/gi, 'blocked:');
      editorRef.current.innerHTML = sanitized;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  const handleInput = () => {
    if (editorRef.current && onChange) {
      const html = editorRef.current.innerHTML;
      const plainText = editorRef.current.innerText;
      onChange(html, plainText);
    }
  };

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertLink = () => {
    const url = prompt("Enter URL:");
    if (url) {
      executeCommand("createLink", url);
    }
  };

  const formatBlock = (tag: string) => {
    executeCommand("formatBlock", tag);
  };

  const toolbarButtons = [
    {
      group: "text",
      buttons: [
        { icon: Bold, command: "bold", tooltip: "Bold (Ctrl+B)" },
        { icon: Italic, command: "italic", tooltip: "Italic (Ctrl+I)" },
        { icon: Underline, command: "underline", tooltip: "Underline (Ctrl+U)" },
        { icon: Strikethrough, command: "strikethrough", tooltip: "Strikethrough" },
      ],
    },
    {
      group: "heading",
      buttons: [
        { icon: Heading1, command: () => formatBlock("h1"), tooltip: "Heading 1" },
        { icon: Heading2, command: () => formatBlock("h2"), tooltip: "Heading 2" },
        { icon: Heading3, command: () => formatBlock("h3"), tooltip: "Heading 3" },
      ],
    },
    {
      group: "list",
      buttons: [
        { icon: ListOrdered, command: "insertOrderedList", tooltip: "Numbered List" },
        { icon: List, command: "insertUnorderedList", tooltip: "Bullet List" },
        { icon: Quote, command: () => formatBlock("blockquote"), tooltip: "Quote" },
      ],
    },
    {
      group: "align",
      buttons: [
        { icon: AlignLeft, command: "justifyLeft", tooltip: "Align Left" },
        { icon: AlignCenter, command: "justifyCenter", tooltip: "Align Center" },
        { icon: AlignRight, command: "justifyRight", tooltip: "Align Right" },
      ],
    },
    {
      group: "insert",
      buttons: [
        { icon: Code, command: () => formatBlock("pre"), tooltip: "Code Block" },
        { icon: Link, command: insertLink, tooltip: "Insert Link" },
      ],
    },
    {
      group: "clear",
      buttons: [
        { icon: RemoveFormatting, command: "removeFormat", tooltip: "Clear Formatting" },
      ],
    },
  ];

  return (
    <div className={`rounded-md border bg-background ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        {toolbarButtons.map((group, groupIndex) => (
          <div key={group.group} className="flex items-center gap-1">
            {group.buttons.map((btn, btnIndex) => (
              <Tooltip key={btnIndex}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={disabled}
                    onClick={() => {
                      if (typeof btn.command === "function") {
                        btn.command();
                      } else {
                        executeCommand(btn.command);
                      }
                    }}
                    data-testid={`button-format-${btn.tooltip.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <btn.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{btn.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            ))}
            {groupIndex < toolbarButtons.length - 1 && (
              <Separator orientation="vertical" className="h-6 mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`
          outline-none p-4 overflow-y-auto
          prose prose-sm max-w-none
          dark:prose-invert
          focus:ring-0
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
        style={{
          minHeight,
          maxHeight,
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        data-testid="rich-text-editor-content"
      />

      {/* Placeholder */}
      {!value && !isFocused && (
        <div
          className="absolute top-[52px] left-4 text-muted-foreground pointer-events-none"
          style={{ paddingTop: "1rem" }}
        >
          {placeholder}
        </div>
      )}

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
        }
        
        [contenteditable] h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin: 0.5rem 0;
        }
        
        [contenteditable] h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0.5rem 0;
        }
        
        [contenteditable] h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0.5rem 0;
        }
        
        [contenteditable] pre {
          background: hsl(var(--muted));
          padding: 0.75rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          font-family: monospace;
          margin: 0.5rem 0;
        }
        
        [contenteditable] blockquote {
          border-left: 4px solid hsl(var(--primary));
          padding-left: 1rem;
          margin: 0.5rem 0;
          font-style: italic;
        }
        
        [contenteditable] ul {
          list-style: disc;
          padding-left: 2rem;
          margin: 0.5rem 0;
        }
        
        [contenteditable] ol {
          list-style: decimal;
          padding-left: 2rem;
          margin: 0.5rem 0;
        }
        
        [contenteditable] a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        
        [contenteditable]:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
}
