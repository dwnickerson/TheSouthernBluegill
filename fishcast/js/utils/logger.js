const debugEnabled = () => {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.search.includes('debug=true') || window.localStorage.getItem('fishcast_debug') === '1';
};

export function createLogger(scope = 'app') {
    return (...args) => {
        if (debugEnabled()) {
            console.debug(`[${scope}]`, ...args);
        }
    };
}
