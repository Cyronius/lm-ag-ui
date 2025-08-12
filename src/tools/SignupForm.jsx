import React, { useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    IconButton,
    InputAdornment,
    Link,
    TextField,
    Typography
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

export default function SignupForm() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const handleSignUp = async (e) => {
        e.preventDefault();
        
        let signupForm = {
            urlHostName: window.location.origin,            
            //gRecaptchaResponse: token,
            signupValues: [
                { name: "email", value: email },
                { name: "accountName", value: fullName },
                { name: "password", value: password },
                { name: "fullName", value: fullName },
                { name: "agreeTos", value: acceptedTerms },
                { name: "referrer", value: document.referrer },                
                { name: "signupType", value: 'authoring' }
            ]
        };

        let res = await fetch(`${import.meta.env.VITE_LOGIN_URL}/Account/AccountSignUp`, {
            body: JSON.stringify(signupForm),
            headers: {                  
                "Content-Type": 'application/json'
            },
            method: "POST",
        });
        
        if (res && res.ok) {
            let { accountId } = res.json()
            console.log('account id is', accountId)
        }
        else {
            console.error(res)
            throw new Error(`Error creating account code=${res.status}, detail=${res.statusText}`)
        }
        
    };

    return (
        <Box
            sx={{                
                margin: '0 auto',
                mt: 7,
                p: 4,                
                borderRadius: 3,
                boxShadow: 6,                
            }}
        >
            <Typography variant="h6" sx={{ mb: 2 }}>
                Great! We just need a few pieces of information first to get you started.
            </Typography>
            <form onSubmit={handleSignUp}>
                <TextField
                    label="Full name"
                    variant="outlined"
                    fullWidth
                    required
                    margin="normal"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}                    
                />
                <TextField
                    label="Email"
                    variant="outlined"
                    fullWidth
                    required
                    type="email"
                    margin="normal"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}                    
                />
                <TextField
                    label="Password"
                    variant="outlined"
                    fullWidth
                    required
                    type={showPassword ? 'text' : 'password'}
                    margin="normal"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    InputProps={{                        
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    edge="end"
                                    tabIndex={-1}                      
                                >
                                    {showPassword ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            </InputAdornment>
                        )
                    }}                    
                />

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={acceptedTerms}
                            onChange={(e) => setAcceptedTerms(e.target.checked)}                            
                        />
                    }
                    label={
                        <Typography variant="body2" >
                            I accept the{' '}
                            <Link
                                href="https://learnermobile.com/terms-and-conditions/"
                                target="_blank"
                                rel="noopener noreferrer"
                                color="primary"
                                underline="hover"
                            >
                                Terms of Service
                            </Link>{' '}
                            and{' '}
                            <Link
                                href="https://learnermobile.com/privacy-policy/"
                                target="_blank"
                                rel="noopener noreferrer"
                                color="primary"
                                underline="hover"
                            >
                                Privacy Policy
                            </Link>
                        </Typography>
                    }
                    sx={{ mt: 2 }}
                />

                <Button
                    type="submit"
                    variant="contained"
                    color="error"
                    fullWidth
                    sx={{ mt: 3, fontWeight: 700, fontSize: '1rem', py: 1.5 }}
                    disabled={!acceptedTerms}
                >
                    Sign me up for free!
                </Button>
            </form>
            <Typography variant="body2" sx={{ mt: 3, textAlign: 'center' }}>
                Already have an account?{' '}
                <Link
                    href="https://admin.learnermobilelabs.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    color="primary"
                    underline="hover"
                    sx={{ fontWeight: 500 }}
                >
                    Log in
                </Link>{' '}
                instead!
            </Typography>
        </Box>
    );
}
