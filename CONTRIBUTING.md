# 🤝 Contributing to Nova REST Client

First off, thank you for taking the time to contribute! Contributions are what make the open-source community such an amazing place to learn, inspire, and create.

---

## 📜 Development Guidelines

To maintain a highly clean, robust, and readable codebase, please adhere to the following standards:

### 1. File Naming Conventions
- **All filenames must use `kebab-case`** (lowercase separated by dashes).
- Example: Use `src/storage-manager.ts` instead of `src/storageManager.ts`.
- Directory structures should follow the flat layout: `src/` for extension host logic, `media/` for CSS/JS assets, and `src/webview/` for panel controllers.

### 2. package.json Contributions
- Always configure command definitions and explorer triggers in `package.json`.
- Keep contribution menu mappings organized and descriptive.

### 3. Webview Styling
- **Do not write hardcoded color definitions (e.g. `#fff`, `black`)**. Always utilize native VS Code CSS variable tokens (e.g., `--vscode-editor-background`, `--vscode-foreground`, `--vscode-focusBorder`) so that the extension automatically integrates with user custom themes.
- Implement glassmorphism using HSL tailored gradients (`linear-gradient`) and subtle blurs (`backdrop-filter`) for interactive panels.

---

## 🛠️ Local Development Workflow

Nova Client relies on **`pnpm`** as its package manager. Please ensure you do not commit any `package-lock.json` or `yarn.lock` files.

### Step-by-Step Setup
1. **Fork and Clone** the repository.
2. **Install Dependencies**:
   ```bash
   pnpm install
   ```
3. **Compile the Code**:
   - For a single compile check:
     ```bash
     pnpm run compile
     ```
   - For background active compiling during editing:
     ```bash
     pnpm run watch
     ```
4. **Debug the Extension**:
   - Open the directory in VS Code.
   - Press **`F5`** on your keyboard (or click **Run > Start Debugging**) to run the *Extension Development Host* window.

---

## 📝 Submitting a Pull Request

1. Create a new branch describing your feature (e.g., `feat/auth-header-support` or `fix/body-parsing`).
2. Implement your changes and confirm they compile without warnings (`pnpm run compile`).
3. Commit your changes using descriptive commit messages.
4. Push your branch and open a Pull Request against the `main` branch.
