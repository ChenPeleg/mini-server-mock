/** @type {import('tailwindcss').Config} */
// This is only for the intelisense plugin
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    safelist: [
        {
            pattern: /./, // the "." means "everything"
        },
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
