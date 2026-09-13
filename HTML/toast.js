/**
 * toast.js
 * Lightweight, accessible, non-blocking toast notification system
 * Replaces intrusive browser alert() calls across the application.
 */

(function () {
    // Create toast container if not present
    function getToastContainer() {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Display a floating toast notification
     * @param {string} message - Text or message to display
     * @param {'success'|'error'|'warning'|'info'} type - Toast type
     * @param {number} duration - Auto-dismiss timeout in ms (default 3500)
     */
    window.showToast = function (message, type = 'info', duration = 3500) {
        if (!message) return;
        const container = getToastContainer();

        const config = {
            success: {
                icon: 'fa-check-circle',
                iconColor: 'text-emerald-400',
                border: 'border-emerald-500/30',
                glow: 'shadow-emerald-500/10'
            },
            error: {
                icon: 'fa-exclamation-circle',
                iconColor: 'text-red-400',
                border: 'border-red-500/30',
                glow: 'shadow-red-500/10'
            },
            warning: {
                icon: 'fa-exclamation-triangle',
                iconColor: 'text-amber-400',
                border: 'border-amber-500/30',
                glow: 'shadow-amber-500/10'
            },
            info: {
                icon: 'fa-info-circle',
                iconColor: 'text-[#4f8ef7]',
                border: 'border-blue-500/30',
                glow: 'shadow-blue-500/10'
            }
        }[type] || {
            icon: 'fa-bell',
            iconColor: 'text-gray-300',
            border: 'border-gray-600',
            glow: ''
        };

        const toast = document.createElement('div');
        toast.className = `pointer-events-auto flex items-start gap-3 bg-[#161a22]/95 backdrop-blur-md text-white p-4 rounded-2xl border ${config.border} shadow-2xl ${config.glow} transform transition-all duration-300 translate-y-[-10px] opacity-0 text-sm`;
        toast.setAttribute('role', 'alert');

        toast.innerHTML = `
            <i class="fas ${config.icon} ${config.iconColor} text-lg mt-0.5 flex-shrink-0"></i>
            <div class="flex-1 font-medium leading-snug">${message}</div>
            <button type="button" aria-label="Dismiss notification" class="text-gray-400 hover:text-white transition flex-shrink-0 ml-1 text-xs p-1">
                <i class="fas fa-times"></i>
            </button>
        `;

        const closeBtn = toast.querySelector('button');
        const dismiss = () => {
            toast.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 300);
        };

        if (closeBtn) closeBtn.onclick = dismiss;

        container.appendChild(toast);

        // Trigger entrance animation in next frame
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-[-10px]', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');
        });

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }
    };
})();
