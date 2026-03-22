document.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProfile();
    });
});

async function loadUserProfile() {
    try {
        const data = await apiCall('/api/auth/me');
        const user = data.user;

        document.getElementById('username').value = user.username || '';
        document.getElementById('age').value = user.age || '';
        document.getElementById('gender').value = user.gender || '';

        if (user.profile_image) {
            updateProfilePreview(user.profile_image);
        } else {
            document.getElementById('profile-preview').textContent = user.username ? user.username[0].toUpperCase() : '?';
        }
    } catch (error) {
        showToast('Error loading profile: ' + error.message, 'error');
    }
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            updateProfilePreview(e.target.result);
        }
        reader.readAsDataURL(input.files[0]);
        document.getElementById('file-name').textContent = input.files[0].name;
    }
}

function updateProfilePreview(src) {
    const preview = document.getElementById('profile-preview');
    preview.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;">`;
}

async function updateProfile() {
    const form = document.getElementById('profile-form');
    const formData = new FormData();

    formData.append('username', document.getElementById('username').value);

    const age = document.getElementById('age').value;
    if (age) formData.append('age', age);

    const gender = document.getElementById('gender').value;
    if (gender) formData.append('gender', gender);

    const fileInput = document.getElementById('profile_image');
    if (fileInput.files.length > 0) {
        formData.append('profile_image', fileInput.files[0]);
    }

    const btn = document.getElementById('save-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/profile/update', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update profile');
        }

        showToast(data.message || 'Profile updated successfully', 'success');

        if (data.user && data.user.profile_image) {
            updateProfilePreview(data.user.profile_image);
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}
