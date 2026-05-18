interface Window {
  electronAPI?: {
    selectFolder: () => Promise<string | null>;
    openExternal?: (url: string) => void;
  };
}
