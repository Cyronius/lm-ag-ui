import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          backgroundColor: '#fff',
          color: '#222',
          border: '1px solid #bbb',
          boxShadow: 'none',
          fontWeight: 500,
          fontSize: '1rem',
          textTransform: 'none',
          '&:hover': {
            backgroundColor: '#f5f5f5',
            borderColor: '#888',
          },
        },
      },
    },
  },
});

export default theme;
