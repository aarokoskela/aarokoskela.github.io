'use strict';

function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('fi-FI', {
        weekday:'long', day:'numeric', month:'long', year:'numeric'
    });
}
function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('fi-FI', { hour:'2-digit', minute:'2-digit' });
}
function toESPNDate(d) {
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}
