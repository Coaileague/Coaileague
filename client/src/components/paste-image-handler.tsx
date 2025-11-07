/**
 * Paste Image Handler Hook
 * Enables copy-paste image support in chat inputs
 */

import { useEffect } from "react";

interface UsePasteImageHandlerProps {
  onImagePaste: (file: File) => void;
  enabled?: boolean;
}

export function usePasteImageHandler({ onImagePaste, enabled = true }: UsePasteImageHandlerProps) {
  useEffect(() => {
    if (!enabled) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for image in clipboard
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          
          const file = item.getAsFile();
          if (file) {
            // Rename file with timestamp
            const renamedFile = new File(
              [file],
              `pasted-image-${Date.now()}.${file.type.split('/')[1]}`,
              { type: file.type }
            );
            
            onImagePaste(renamedFile);
          }
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [onImagePaste, enabled]);
}

/**
 * Paste Handler Component for display hint
 */
interface PasteImageHintProps {
  show?: boolean;
}

export function PasteImageHint({ show = true }: PasteImageHintProps) {
  if (!show) return null;
  
  return (
    <div className="text-xs text-muted-foreground">
      Paste images with Ctrl+V or Cmd+V
    </div>
  );
}
