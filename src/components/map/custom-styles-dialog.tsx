import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type maplibregl from 'maplibre-gl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '../ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '../ui/field';
import { FolderIcon, LoaderIcon } from 'lucide-react';
import { Input } from '../ui/input';
import { saveCustomStyleSpec, saveCustomStyleUrl } from './utils';

// A same-origin path is as valid a style source as an absolute URL, and it is
// the only way to reach a style behind the dev proxy or one we bundle.
const styleUrlSchema = z
  .string()
  .trim()
  .min(1, 'Please enter a URL')
  .refine(
    (value) =>
      value.startsWith('/') || z.string().url().safeParse(value).success,
    'Enter an absolute URL, or a path starting with /'
  );

const mapStyleSchema = z.object({
  version: z.number(),
  name: z.string().optional(),
  sources: z.record(z.unknown()),
  layers: z.array(z.unknown()),
});

interface CustomStylesDialogProps {
  /** URL of the custom style in use, prefilled so it can be edited by hand. */
  currentStyleUrl?: string | null;
  onStyleLoaded?: (styleData: maplibregl.StyleSpecification) => void;
  onStyleUrlLoaded?: (url: string, name?: string) => void;
}

export const CustomStylesDialog = ({
  currentStyleUrl,
  onStyleLoaded,
  onStyleUrlLoaded,
}: CustomStylesDialogProps) => {
  const [styleUrl, setStyleUrl] = useState(currentStyleUrl ?? '');
  const [styleUrlError, setStyleUrlError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reopening should show the URL actually in use, not whatever was typed last.
  useEffect(() => {
    if (dialogOpen) {
      setStyleUrl(currentStyleUrl ?? '');
      setStyleUrlError(null);
    }
  }, [dialogOpen, currentStyleUrl]);

  const saveSpecAndNotify = (styleJson: maplibregl.StyleSpecification) => {
    saveCustomStyleSpec(styleJson);
    onStyleLoaded?.(styleJson);
    setDialogOpen(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = mapStyleSchema.safeParse(json);

      if (!result.success) {
        setStyleUrlError('Invalid MapLibre style.json format');
        return;
      }

      saveSpecAndNotify(json as maplibregl.StyleSpecification);
    } catch {
      setStyleUrlError('Failed to parse JSON file');
    }
  };

  const handleLoadUrl = async () => {
    const urlResult = styleUrlSchema.safeParse(styleUrl);
    if (!urlResult.success) {
      setStyleUrlError(
        urlResult.error.errors[0]?.message ?? 'Please enter a valid URL'
      );
      return;
    }
    const trimmedUrl = urlResult.data;

    setIsLoading(true);
    setStyleUrlError(null);

    try {
      const response = await fetch(trimmedUrl, {
        mode: 'cors',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      const result = mapStyleSchema.safeParse(json);

      if (!result.success) {
        setStyleUrlError('Invalid MapLibre style.json format');
        return;
      }

      // Only fetched to validate and to learn the style's name — the URL is
      // what gets stored, so MapLibre refetches it and server-side edits land.
      const { name } = json as maplibregl.StyleSpecification;
      saveCustomStyleUrl(trimmedUrl, name);
      onStyleUrlLoaded?.(trimmedUrl, name);
      setDialogOpen(false);
    } catch (error) {
      setStyleUrlError(
        error instanceof Error ? error.message : 'Failed to fetch style'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          {currentStyleUrl ? 'Edit custom style URL' : 'Load custom styles'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Custom styles</DialogTitle>
          <DialogDescription>
            Point the map at any MapLibre style.json by URL, or load one from a
            local file.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field className="gap-2" data-invalid={!!styleUrlError}>
            <FieldLabel htmlFor="style-url">Style URL</FieldLabel>
            <FieldDescription>
              Fetched fresh on every load, so edits on the style server show up.
              URL must have{' '}
              <a
                href="https://enable-cors.org/"
                target="_blank"
                rel="noopener noreferrer"
              >
                CORS enabled
              </a>
              .
            </FieldDescription>
            <Input
              type="url"
              id="style-url"
              placeholder="https://example.com/style.json"
              value={styleUrl}
              onChange={(e) => {
                setStyleUrl(e.target.value);
                setStyleUrlError(null);
              }}
              aria-invalid={!!styleUrlError}
            />
            {styleUrlError && <FieldError>{styleUrlError}</FieldError>}
            <Button
              variant="outline"
              onClick={handleLoadUrl}
              disabled={isLoading}
            >
              {isLoading && <LoaderIcon className="size-4 animate-spin" />}
              {currentStyleUrl ? 'Apply' : 'Load'}
            </Button>
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor="style-file">Load from local file</FieldLabel>
            <input
              ref={fileInputRef}
              id="style-file"
              type="file"
              accept=".json"
              className="sr-only"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderIcon className="size-4" />
              Choose file
            </Button>
          </Field>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
};
