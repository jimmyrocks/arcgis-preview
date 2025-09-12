"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const client_1 = require("react-dom/client");
const App_1 = require("./App");
const root = document.getElementById('root');
if (!root)
    throw new Error('Root element not found');
(0, client_1.createRoot)(root).render((0, jsx_runtime_1.jsx)(App_1.default, {}));
