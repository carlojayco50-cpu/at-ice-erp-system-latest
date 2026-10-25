import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

const echo = new Echo({
    broadcaster: 'pusher',
    key: import.meta.env.VITE_PUSHER_APP_KEY,
    cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER,
    forceTLS: true,
    // Channels are private: each subscription is signed by the API with the
    // current login token (read at subscribe time, so a new sign-in works).
    authorizer: (channel) => ({
        authorize: (socketId, callback) => {
            fetch('/api/broadcasting/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
                body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
            })
                .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Channel auth failed (${res.status})`))))
                .then((data) => callback(null, data))
                .catch((err) => callback(err, null));
        },
    }),
});

window.Echo = echo;

export default echo;