// JS/register.js
document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registration-form'); // Corrected ID
    let profilePhotoBase64 = null;

    // Handle Photo Input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => { profilePhotoBase64 = event.target.result; };
                reader.readAsDataURL(file);
            }
        });
    }

    // Look for a message element or create an alert fallback
    const showMessage = (msg, isError = true) => {
        const messageDiv = document.getElementById('message'); // Corrected ID
        if (messageDiv) {
            messageDiv.textContent = msg;
            messageDiv.style.color = isError ? '#e53e3e' : '#38a169';
            messageDiv.style.fontWeight = 'bold'; // Added for better visibility
            messageDiv.style.whiteSpace = 'pre-line'; // Ensures newlines from join('\n') are visible
        } else {
            alert(msg);
        }
    };

    if (registerForm) {
        // Basic client-side validation for password match
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');

        confirmPasswordInput.addEventListener('input', () => {
            if (passwordInput.value !== confirmPasswordInput.value) {
                confirmPasswordInput.setCustomValidity('Passwords do not match.');
            } else {
                confirmPasswordInput.setCustomValidity('');
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const mobileNumber = document.getElementById('mobileNumber').value.trim(); // Mobile number is still required
            const carRegistration = document.getElementById('carRegistration').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const inviteCode = document.getElementById('inviteCode')?.value.trim() || null;

            // Additional client-side validation
            if (password !== confirmPassword) {
                showMessage('Passwords do not match.', true);
                return;
            }

            // Sanitize mobile number: remove spaces, dashes, and parentheses
            // This ensures +27 72 123 4567 becomes +27721234567
            const cleanedMobile = mobileNumber.replace(/[\s\-()]/g, '');

            // Disable button to prevent multiple submissions
            const submitButton = registerForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Registering...';

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        firstName, 
                        lastName, 
                        mobileNumber: cleanedMobile, // Mobile number is still sent
                        carRegistration: carRegistration === '' ? null : carRegistration, // Send null if empty
                        password,
                        profilePhoto: profilePhotoBase64,
                        inviteCode
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage('Registration successful! Redirecting...', false);
                    setTimeout(() => {
                        window.location.href = '/login.html'; // Use absolute path
                    }, 1500);
                } else {
                    // Check if the backend sent a specific array of validation errors
                    if (data.errors && Array.isArray(data.errors)) {
                        const errorSummary = data.errors.map(err => `• ${err.msg}`).join('\n');
                        showMessage(errorSummary);
                    } else {
                        showMessage(data.message || 'Registration failed');
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                showMessage('An error occurred during registration.');
            } finally {
                // Re-enable button after submission attempt
                submitButton.disabled = false;
                submitButton.textContent = 'Register';
            }
        });
    }
});