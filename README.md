# 🌐 Nova REST Client

Nova is a high-fidelity, Git-friendly REST API client VS Code extension. Unlike other clients that store request data in global application states, Nova stores your API collections and environment configurations **directly inside your workspace's `.vscode/` directory**.

This ensures your API documentation and environment definitions stay version-controlled, clean, and perfectly synchronized across your team on a per-repository basis—without cross-project clutter!

---

## ✨ Features

- **📂 Git-Friendly Workspace Storage**: Collections are saved inside `.vscode/nova-client/collections/` and Environments inside `.vscode/nova-client/environments/` as readable, diff-friendly JSON.
- **🔄 Postman Compatibility**: Easily drop existing Postman Collections (v2.1.0) and Environment exports into your workspace folder to use them instantly.
- **✨ Variable Resolution**: Supports resolving standard double curly-brace parameters (e.g. `{{baseUrl}}/api/v1/{{userId}}`) based on selected environments.
- **🔐 Secure `.env` Overrides**: Private secrets (like passwords or API tokens) can be defined in a local, gitignored `.env` file at the root of your workspace to override public environment values without risking exposure.
- **🎛️ Bypasses CORS**: Executes requests inside VS Code's Node.js Extension Host instead of the browser context, eliminating all CORS restriction problems.
- **🔮 Premium Glassmorphic UI**: Adapts automatically to your active VS Code theme (Dark, Light, High Contrast) using glassmorphism effects and modern transition micro-animations.

---

## 🚀 Getting Started

### 📂 Workspace Structure
Once initialized, Nova creates the following directory structure inside your active workspace folder:

```text
my-project/
├── .env                       <-- Define local secret overrides here
└── .vscode/
    └── nova-client/
        ├── collections/
        │   └── api-v1.json    <-- Committed in Git (Postman Collection v2.1.0 format)
        └── environments/
            └── staging.json   <-- Committed in Git (Postman Environment format)
```

### ⚡ Custom `.env` Variables
To define private secrets locally (which overrides public settings), add them to your root `.env` file:
```env
# .env (Make sure this file is in your .gitignore!)
API_KEY="my-secret-production-token"
baseUrl="http://localhost:5000"
```
In your requests, access them simply using `{{API_KEY}}` or `{{baseUrl}}`.

---

## 🛠️ Development & Contributions

Nova Client is built natively with TypeScript, Vanilla CSS, and modern HTML5 Webview APIs. 

### Local Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Compile the code:
   ```bash
   pnpm run compile
   ```
4. Press **`F5`** inside VS Code to launch the **Extension Development Host** and see Nova Client in action!

---

## 📄 License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
