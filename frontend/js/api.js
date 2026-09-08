// TrafficEye AI — REST API Client

const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://127.0.0.1:8000/api'
    : '/api';

class TrafficEyeAPI {
    static async getDashboardMetrics() {
        try {
            const res = await fetch(`${API_BASE_URL}/dashboard/metrics`);
            if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
            return await res.json();
        } catch (err) {
            console.warn('Backend API offline, falling back to local state metrics:', err);
            return null;
        }
    }

    static async analyzeImage(file = null, sampleTag = null) {
        const formData = new FormData();
        if (file) {
            formData.append('file', file);
        }
        if (sampleTag) {
            formData.append('sample_tag', sampleTag);
        }

        const res = await fetch(`${API_BASE_URL}/analyze/image`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Image analysis failed');
        }

        return await res.json();
    }

    static async analyzeVideo(videoFile) {
        const formData = new FormData();
        formData.append('file', videoFile);

        const res = await fetch(`${API_BASE_URL}/analyze/video`, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Video analysis failed');
        return await res.json();
    }

    static async getViolations(status = null, violationType = null) {
        try {
            const params = new URLSearchParams();
            if (status) params.append('status', status);
            if (violationType) params.append('violation_type', violationType);

            const res = await fetch(`${API_BASE_URL}/violations?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch violations');
            return await res.json();
        } catch (err) {
            console.warn('Using local violations state fallback:', err);
            return null;
        }
    }

    static async confirmViolation(violationId, editedPlateText = null) {
        const res = await fetch(`${API_BASE_URL}/violations/${violationId}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'CONFIRMED',
                edited_plate_text: editedPlateText
            })
        });

        if (!res.ok) throw new Error('Failed to confirm violation');
        return await res.json();
    }

    static async rejectViolation(violationId, reason = null) {
        const res = await fetch(`${API_BASE_URL}/violations/${violationId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'REJECTED',
                rejection_reason: reason
            })
        });

        if (!res.ok) throw new Error('Failed to reject violation');
        return await res.json();
    }

    static async getChallans(status = null, registration = null) {
        try {
            const params = new URLSearchParams();
            if (status) params.append('status', status);
            if (registration) params.append('registration', registration);

            const res = await fetch(`${API_BASE_URL}/challans?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch challans');
            return await res.json();
        } catch (err) {
            console.warn('Using local challan database fallback:', err);
            return null;
        }
    }

    static async payChallan(challanId) {
        const res = await fetch(`${API_BASE_URL}/challans/${challanId}/pay`, {
            method: 'POST'
        });

        if (!res.ok) throw new Error('Failed to settle challan');
        return await res.json();
    }
}
