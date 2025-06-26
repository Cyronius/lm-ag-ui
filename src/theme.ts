import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        primary: {
            main: '#2462ad', 
            
        },
        secondary: {
            main: '#2462ad', 
        }
    },
    typography: {        
        fontFamily: 'Rubik',        
        allVariants: {
            color: '#2462ad', // Or theme.palette.customText.main if referenced as a function
        },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 20,
                    //backgroundColor: '#fff',
                    // color: '#222',
                    //color: 'primary',
                    border: '1px solid #bbb',
                    boxShadow: 'none',
                    fontWeight: 500,
                    fontSize: '1rem',
                    textTransform: 'none',
                    '&:hover': {
                        //backgroundColor: '#f5f5f5',
                        //borderColor: '#888',
                    },
                },
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
