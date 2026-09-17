import { TextField } from '@mui/material';

/** Sets `q` in the URL when the User presses Enter. */
export function SearchField({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  return (
    <form
      role="search"
      style={{ flexGrow: 1 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(String(new FormData(event.currentTarget).get('q') ?? ''));
      }}
    >
      <TextField
        // Remount when the URL changes, e.g. on back and forward.
        key={value}
        name="q"
        type="search"
        label="Search"
        size="small"
        fullWidth
        defaultValue={value}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
    </form>
  );
}

/** `path` with `params`, leaving out empty values. */
export function withParams(path: string, params: URLSearchParams): string {
  const kept = new URLSearchParams([...params].filter(([, value]) => value.trim() !== ''));
  const query = kept.toString();
  return query ? `${path}?${query}` : path;
}
