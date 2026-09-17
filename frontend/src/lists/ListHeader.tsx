import { Button, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

export function ListHeader({
  title,
  newLabel,
  onNew,
}: {
  title: string;
  newLabel: string;
  onNew: () => void;
}) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <Typography variant="h4" component="h1">
        {title}
      </Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
        {newLabel}
      </Button>
    </Stack>
  );
}
