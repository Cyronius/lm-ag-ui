import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Player } from '@lottiefiles/react-lottie-player';
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
import { useAgentContext } from '../contexts/AgentClientContext';

export default function SignupForm() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState(null);
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const { globalState } = useAgentContext();

    const [isLoading, setIsLoading] = useState(false);

    const validateEmail = async (e) => {

        let email = e.target.value
        if (!email) {
            setEmailError("Email is required");
            return
        }

        // check if email is formatted as "_@_._"
        if (!/\S+@\S+\.\S+/.test(email)) {
            setEmailError("Invalid Email Format");
            return;
        }

        var validateParams = new URLSearchParams();
        validateParams.append("email", email?.trim());
        validateParams.append("whiteListDomains", ['gmail.com']);

        let res = await fetch(`${import.meta.env.VITE_ADMIN_URL}/Account/ValidateEmail?${validateParams.toString()}`, {
            headers: {
                "Content-Type": "application/json",
                //"Access-Control-Allow-Credentials": "true",
            },
            //credentials: "include",
            method: "POST",
        });

        if (!res) {
            return
        }

        if (res.ok) {
            let json = await res.json();
            if (json.success) {
                setEmailError(null);
            }
            else {
                setEmailError("Invalid Email");
            }
        }
        else {
            // some kind of server error
            setEmailError("Error validating email");
        }
    }

    const validatePassword = (e) => {
        let password = e.target.value        
        if (!password || password.length < 6) {
            setPasswordError("Error validating password");
        } else {
            setPasswordError(null);
        }        
    }

    const handleSignUp = async (e) => {
        setIsLoading(true);
        e.preventDefault();

        let signupForm = {
            urlHostName: window.location.origin,
            //gRecaptchaResponse: token,
            signupValues: [
                { name: "email", value: email },
                { name: "accountName", value: fullName },
                { name: "password", value: password },
                { name: "fullName", value: fullName },
                { name: "agreeTos", value: acceptedTerms.toString() },
                { name: "referrer", value: document.referrer },
                { name: "signupType", value: 'authoring' }
            ]
        };

        // Add accountId from globalState if it exists
        const accountIdFromState = globalState['soco_outline']?.account_id;
        if (accountIdFromState) {
            signupForm.signupValues.push({ name: "accountId", value: accountIdFromState });
            globalState['account_id'] = accountIdFromState;
        }

        let accountId = await createAccount(signupForm)
        let versionId = await createSocoCourseFromOutline(accountId)

        // redirect to either admin cbiv or admin landing dpeending on if a soco was created
        let redirectUrl = `${import.meta.env.VITE_ADMIN_URL}`
        if (versionId) {
           redirectUrl = `${redirectUrl}/course/Edit/${versionId}`
        }        
        window.top.location.replace(redirectUrl);
    }

    /** creates the account and returns the accountId */
    async function createAccount(signupForm) {
        let res = await fetch(`${import.meta.env.VITE_LOGIN_URL}/Account/AccountSignUp`, {
            body: JSON.stringify(signupForm),
            headers: {
                "Content-Type": 'application/json'
            },
            method: "POST",
        });

        // raced response
        if (!res) {
            return null
        }

        if (res.ok) {
            let { accountId } = await res.json()
            console.log('account id is', accountId)
            return accountId;
        }
        else {
            setIsLoading(false);
            console.error(res)
            throw new Error(`Error creating account code=${res.status}, detail=${res.statusText}`)
        }

    }

    /** write the generated soco outline to cards/course tables */
    async function createSocoCourseFromOutline(accountId) {
        let socoOutline = globalState['soco_outline']
        console.log('outline', socoOutline)

        if (!socoOutline) {
            return null
        }

        let req = {
            course_outline: socoOutline,
            account_id: accountId,
            user_id: ""
        }

        let res = await fetch(`${import.meta.env.VITE_PYTHON_SERVER_URL}/soco/outline`, {
            body: JSON.stringify(req),
            headers: {
                "Content-Type": 'application/json'
            },
            method: "POST",
        });
        
        // raced response
        if (!res) {
            return null            
        }
        
        if (!res.ok) {
            setIsLoading(false);
            console.log('failed to create course with status and message', res.status, res.statusText)
            throw 'failed to create course'
        }
        
        let { VersionId } = await res.json()        
        return VersionId
    }

    return (
        <Box
            sx={{
                margin: "0 auto",
                mt: 7,
                p: 4,
                borderRadius: 3,
                boxShadow: 6,
            }}
        >
            {createPortal(
                <Box
                    sx={{
                        position: "absolute",
                        top: "0",
                        right: "0",
                        left: "0",
                        bottom: "0",
                        background: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        visibility: isLoading ? "visible" : "hidden",
                        opacity: isLoading ? "1" : "0",
                        transition: "visibility 0s, opacity 0.5s linear",
                        zIndex: 100
                    }}
                >
                    <Player
                        autoplay
                        loop
                        src="/lottie/SignUpLoading.json"
                        style={{ width: "100%" }}
                    ></Player>
                </Box>,
                document.body
            )}

            <Typography variant="h6" sx={{ mb: 2 }}>
                Great! We just need a few pieces of information first to get you
                started.
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
                    onChange={(e) => {
                        setEmail(e.target.value);
                    }}
                    onBlur={validateEmail}
                    error={!!emailError}
                    helperText={emailError}
                />
                <TextField
                    label="Password"
                    variant="outlined"
                    fullWidth
                    required
                    type={showPassword ? "text" : "password"}
                    margin="normal"
                    onChange={(e) => {validatePassword(e); setPassword(e.target.value)}}
                    error={!!password && password.length < 6}
                    helperText={
                        password && password.length < 6
                            ? "Password must be at least 6 characters."
                            : null
                    }
                    InputProps={{
                        endAdornment: (
                            <InputAdornment position="end">
                                <IconButton
                                    aria-label={
                                        showPassword
                                            ? "Hide password"
                                            : "Show password"
                                    }
                                    onClick={() =>
                                        setShowPassword((prev) => !prev)
                                    }
                                    edge="end"
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        <VisibilityOff />
                                    ) : (
                                        <Visibility />
                                    )}
                                </IconButton>
                            </InputAdornment>
                        ),
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
                        <Typography variant="body2">
                            I accept the{" "}
                            <Link
                                href="https://learnermobile.com/terms-and-conditions/"
                                target="_blank"
                                rel="noopener noreferrer"
                                color="primary"
                                underline="hover"
                            >
                                Terms of Service
                            </Link>{" "}
                            and{" "}
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
                    sx={{ mt: 3, fontWeight: 700, fontSize: "1rem", py: 1.5 }}
                    disabled={!acceptedTerms || emailError || passwordError}
                >
                    Sign me up for free!
                </Button>
            </form>
            <Typography variant="body2" sx={{ mt: 3, textAlign: "center" }}>
                Already have an account?{" "}
                <Link
                    href="https://admin.learnermobilelabs.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    color="primary"
                    underline="hover"
                    sx={{ fontWeight: 500 }}
                >
                    Log in
                </Link>{" "}
                instead!
            </Typography>
        </Box>
    );


}