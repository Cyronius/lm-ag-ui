// FilePreviewer.tsx
import * as React from "react";
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  CardMedia,
  IconButton,
  Button,
  Chip,
  Divider,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import ImageIcon from "@mui/icons-material/Image";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import MovieIcon from "@mui/icons-material/Movie";
import UploadFileIcon from "@mui/icons-material/UploadFile";

type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "generic";

type PickedFile = {
  id: string;                 // stable key
  file: File;
  url?: string;               // object URL for media/PDF
  textSample?: string;        // for text previews
  kind: PreviewKind;
};

export interface FilePreviewerProps {
  accept?: string;            // e.g. "image/*,application/pdf"
  multiple?: boolean;
  maxTextPreviewBytes?: number; // how much text to preview
  onFilesChange?: (files: File[]) => void;
}

function classify(kind: string, name: string): PreviewKind {
  if (kind.startsWith("image/")) return "image";
  if (kind.startsWith("video/")) return "video";
  if (kind.startsWith("audio/")) return "audio";
  if (kind === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (
    kind.startsWith("text/") ||
    /\.((txt|csv|md|log|json|xml|yaml|yml))$/i.test(name)
  ) return "text";
  return "generic";
}

export default function FilePreviewer({
  accept,
  multiple = true,
  maxTextPreviewBytes = 64 * 1024,
  onFilesChange,
}: FilePreviewerProps) {
  const [items, setItems] = React.useState<PickedFile[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // cleanup blob URLs
  React.useEffect(() => {
    return () => {
      items.forEach(i => i.url && URL.revokeObjectURL(i.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = React.useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list);
    const mapped = await Promise.all(
      files.map(async (file) => {
        const kind = classify(file.type, file.name);
        let url: string | undefined;
        let textSample: string | undefined;

        if (kind === "image" || kind === "video" || kind === "audio" || kind === "pdf") {
          url = URL.createObjectURL(file);
        } else if (kind === "text") {
          textSample = await readTextHead(file, maxTextPreviewBytes);
        }

        return {
          id: crypto.randomUUID(),
          file,
          url,
          textSample,
          kind,
        } as PickedFile;
      })
    );

    setItems(prev => {
      // revoke duplicates' URLs if same name+size was already there
      const next = [...prev, ...mapped];
      onFilesChange?.(next.map(p => p.file));
      return next;
    });
  }, [maxTextPreviewBytes, onFilesChange]);

  const removeItem = (id: string) => {
    setItems(prev => {
      const toRemove = prev.find(p => p.id === id);
      if (toRemove?.url) URL.revokeObjectURL(toRemove.url);
      const next = prev.filter(p => p.id !== id);
      onFilesChange?.(next.map(p => p.file));
      return next;
    });
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const onBrowse = () => inputRef.current?.click();

  return (
    <Stack spacing={2}>
      {/* Dropzone / Picker */}
      <Box
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onBrowse()}
        sx={{
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          p: 3,
          textAlign: "center",
          bgcolor: "background.default",
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
        onClick={onBrowse}
        aria-label="File upload dropzone"
      >
        <UploadFileIcon sx={{ fontSize: 36, mb: 1 }} />
        <Typography variant="body1">
          Drag & drop files here, or <strong>click to browse</strong>
        </Typography>
        {accept && (
          <Typography variant="caption" color="text.secondary">
            Accepted: {accept}
          </Typography>
        )}
      </Box>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />

      {/* Previews */}
      {items.length > 0 && (
        <>
          <Divider />
          <Stack direction="row" flexWrap="wrap" gap={2}>
            {items.map(item => (
              <PreviewCard key={item.id} data={item} onRemove={() => removeItem(item.id)} />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

// Helpers

async function readTextHead(file: File, limit: number): Promise<string> {
  const slice = file.slice(0, limit);
  const text = await slice.text();
  const truncated = file.size > limit ? `${text}\n… (truncated)` : text;
  // keep it reasonably small in the UI
  return truncated.replace(/\0/g, ""); // strip NULs if a "text/*" mislabel
}

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function ext(name: string): string {
  const m = /\.([^.]+)$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

// Preview card

function PreviewCard({
  data,
  onRemove,
}: {
  data: PickedFile;
  onRemove: () => void;
}) {
  const { file, url, textSample, kind } = data;

  const iconByKind = {
    image: <ImageIcon />,
    video: <MovieIcon />,
    audio: <AudiotrackIcon />,
    pdf: <PictureAsPdfIcon />,
    text: <InsertDriveFileIcon />,
    generic: <InsertDriveFileIcon />,
  }[kind];

  return (
    <Card
      variant="outlined"
      sx={{
        width: 280,
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
      }}
    >
      {/* Media area */}
      <Box sx={{ p: 1, display: "grid", placeItems: "center", minHeight: 140 }}>
        {kind === "image" && url && (
          <CardMedia
            component="img"
            image={url}
            alt={file.name}
            sx={{ maxHeight: 180, objectFit: "contain", borderRadius: 1 }}
          />
        )}

        {kind === "video" && url && (
          <Box sx={{ width: "100%" }}>
            <video src={url} controls style={{ width: "100%", borderRadius: 8 }} />
          </Box>
        )}

        {kind === "audio" && url && (
          <audio src={url} controls style={{ width: "100%" }} />
        )}

        {kind === "pdf" && url && (
          // Many browsers can render PDF blobs inline
          <iframe
            title={file.name}
            src={url}
            style={{ width: "100%", height: 200, border: 0, borderRadius: 8 }}
          />
        )}

        {kind === "text" && (
          <Box
            sx={{
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              p: 1,
              width: "100%",
              maxHeight: 200,
              overflow: "auto",
              fontFamily: "monospace",
              fontSize: 12,
              borderRadius: 1,
              whiteSpace: "pre-wrap",
            }}
          >
            {textSample}
          </Box>
        )}

        {kind === "generic" && (
          <Stack alignItems="center" spacing={1} sx={{ py: 2 }}>
            <InsertDriveFileIcon fontSize="large" />
            <Typography variant="body2" color="text.secondary">
              No preview available
            </Typography>
          </Stack>
        )}
      </Box>

      <CardContent sx={{ pt: 1, pb: 1, flexGrow: 1 }}>
        <Stack spacing={0.5}>
          <Typography
            variant="body2"
            noWrap
            title={file.name}
            sx={{ fontWeight: 600 }}
          >
            {file.name}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" icon={iconByKind} label={kind.toUpperCase()} />
            <Typography variant="caption" color="text.secondary">
              {prettySize(file.size)}{ext(file.name) ? ` · .${ext(file.name)}` : ""}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>

      <Box sx={{ display: "flex", justifyContent: "space-between", px: 1, pb: 1 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            // let users download the selected file again if they want
            const blobUrl = url ?? URL.createObjectURL(file);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = file.name;
            a.click();
            if (!url) URL.revokeObjectURL(blobUrl);
          }}
        >
          Download
        </Button>
        <IconButton
          aria-label={`Remove ${file.name}`}
          onClick={onRemove}
          size="small"
        >
          <DeleteOutlineIcon />
        </IconButton>
      </Box>
    </Card>
  );
}