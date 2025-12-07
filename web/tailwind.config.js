/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{ts,tsx,js,jsx}"
    ],
    safelist: [
        // Avatar gradients
        'bg-gradient-to-br', 'from-blue-400', 'to-blue-600',
        'from-purple-400', 'to-purple-600',
        'from-pink-400', 'to-pink-600',
        'from-rose-400', 'to-rose-600',
        'from-orange-400', 'to-orange-600',
        'from-amber-400', 'to-amber-600',
        'from-lime-400', 'to-lime-600',
        'from-emerald-400', 'to-emerald-600',
        'from-teal-400', 'to-teal-600',
        'from-cyan-400', 'to-cyan-600',
        'from-indigo-400', 'to-indigo-600',
        'from-violet-400', 'to-violet-600',
        // Badge gradients
        'bg-gradient-to-r', 'from-blue-500', 'to-blue-600',
        'from-purple-500', 'to-purple-600',
        'from-pink-500', 'to-pink-600',
        'from-rose-500', 'to-rose-600',
        'from-orange-500', 'to-orange-600',
        'from-amber-500', 'to-amber-600',
        'from-lime-500', 'to-lime-600',
        'from-emerald-500', 'to-emerald-600',
        'from-teal-500', 'to-teal-600',
        'from-cyan-500', 'to-cyan-600',
        'from-indigo-500', 'to-indigo-600',
        'from-violet-500', 'to-violet-600',
        // Bubble backgrounds
        'from-blue-50', 'via-blue-100/50',
        'from-purple-50', 'via-purple-100/50',
        'from-pink-50', 'via-pink-100/50',
        'from-rose-50', 'via-rose-100/50',
        'from-orange-50', 'via-orange-100/50',
        'from-amber-50', 'via-amber-100/50',
        'from-lime-50', 'via-lime-100/50',
        'from-emerald-50', 'via-emerald-100/50',
        'from-teal-50', 'via-teal-100/50',
        'from-cyan-50', 'via-cyan-100/50',
        'from-indigo-50', 'via-indigo-100/50',
        'from-violet-50', 'via-violet-100/50',
        'to-white',
        // Borders
        'border-blue-200', 'border-purple-200', 'border-pink-200',
        'border-rose-200', 'border-orange-200', 'border-amber-200',
        'border-lime-200', 'border-emerald-200', 'border-teal-200',
        'border-cyan-200', 'border-indigo-200', 'border-violet-200',
        // Rings
        'ring-blue-300', 'ring-purple-300', 'ring-pink-300',
        'ring-rose-300', 'ring-orange-300', 'ring-amber-300',
        'ring-lime-300', 'ring-emerald-300', 'ring-teal-300',
        'ring-cyan-300', 'ring-indigo-300', 'ring-violet-300',
    ],
    theme: {
        extend: {},
    },
    plugins: [require("tailwindcss-animate")],
}
