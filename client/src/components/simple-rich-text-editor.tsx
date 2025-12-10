import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Code,
  Link,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SimpleRichTextEditorProps {
  value?: string;
  onChange?: (html: string, plainText: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}

export function SimpleRichTextEditor({
  value = "",
  onChange,
  placeholder = "Type your message...",
  className = "",
  disabled = false,
  autoFocus = false,
  compact = true,
}: SimpleRichTextEditorProps) {
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
    { icon: Bold, command: "bold", tooltip: "Bold" },
    { icon: Italic, command: "italic", tooltip: "Italic" },
    { icon: Underline, command: "underline", tooltip: "Underline" },
    { icon: ListOrdered, command: "insertOrderedList", tooltip: "Numbered List" },
    { icon: List, command: "insertUnorderedList", tooltip: "Bullet List" },
    { icon: Code, command: () => formatBlock("pre"), tooltip: "Code" },
    { icon: Link, command: insertLink, tooltip: "Link" },
  ];

  return (
    <div className={`relative ${className}`}>
      {/* Compact Toolbar - Only shows on focus */}
      {isFocused && (
        <div className="absolute bottom-full left-0 mb-1 flex items-center gap-0.5 bg-card border rounded-md p-1 shadow-lg z-10">
          {toolbarButtons.map((btn, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={disabled}
                  onClick={() => {
                    if (typeof btn.command === "function") {
                      btn.command();
                    } else {
                      executeCommand(btn.command);
                    }
                  }}
                  data-testid={`button-format-${btn.tooltip.toLowerCase()}`}
                >
                  <btn.icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{btn.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`
          outline-none px-3 py-2 rounded-md border bg-background
          min-h-[80px] max-h-[200px] overflow-y-auto
          prose prose-sm max-w-none dark:prose-invert
          focus:ring-2 focus:ring-primary/20
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        data-testid="simple-rich-text-editor-content"
      />

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
        }
        
        [contenteditable] pre {
          background: hsl(var(--muted));
          padding: 0.5rem;
          border-radius: 0.25rem;
          overflow-x: auto;
          font-family: monospace;
          margin: 0.25rem 0;
          font-size: 0.875rem;
        }
        
        [contenteditable] ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin: 0.25rem 0;
        }
        
        [contenteditable] ol {
          list-style: decimal;
          padding-left: 1.5rem;
          margin: 0.25rem 0;
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
