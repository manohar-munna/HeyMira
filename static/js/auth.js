// HeyMira - Auth (Login & Register)

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Check URL params for role pre-selection
    const params = new URLSearchParams(window.location.search);
    if (params.get('role') === 'doctor') {
        selectRole('doctor');
    }
});

function selectRole(role) {
    document.getElementById('role').value = role;
    document.querySelectorAll('.role-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.role === role);
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const errorEl = document.getElementById('error-msg');
    const btn = document.getElementById('login-btn');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showError(errorEl, 'Please fill in all fields');
        return;
    }

    btn.textContent = 'Signing in...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        // Save theme from user profile
        if (data.user && data.user.theme) {
            localStorage.setItem('heymira-theme', data.user.theme);
        }

        // Redirect based on role
        if (data.user.role === 'doctor') {
            window.location.href = '/dashboard';
        } else {
            window.location.href = '/chat';
        }
    } catch (error) {
        showError(errorEl, error.message);
        btn.textContent = 'Sign In';
        btn.disabled = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const errorEl = document.getElementById('error-msg');
    const btn = document.getElementById('register-btn');

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    if (!username || !email || !password) {
        showError(errorEl, 'Please fill in all fields');
        return;
    }

    btn.textContent = 'Creating account...';
    btn.disabled = true;

    try {
        const data = await apiCall('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password, role })
        });

        if (data.user.role === 'doctor') {
            window.location.href = '/dashboard';
        } else {
            window.location.href = '/chat';
        }
    } catch (error) {
        showError(errorEl, error.message);
        btn.textContent = 'Create Account';
        btn.disabled = false;
    }
}

function showError(el, message) {
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}
