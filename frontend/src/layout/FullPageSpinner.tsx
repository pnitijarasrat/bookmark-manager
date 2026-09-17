import { Box, CircularProgress } from '@mui/material';

export function FullPageSpinner() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}
