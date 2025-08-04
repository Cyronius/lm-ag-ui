import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        primary: {
            main: '#2462ad'
        },
        secondary: {
            main: '#2462ad'
        }
    },
    typography: {
        fontFamily: 'Rubik',
        allVariants: {
            color: '#2462ad'
        }
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 20,
                    border: '1px solid #bbb',
                    boxShadow: 'none',
                    fontWeight: 500,
                    fontSize: '1rem',
                    textTransform: 'none'
                }
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: '9999px',
                },
            },
        },
    },
});

export default theme;
