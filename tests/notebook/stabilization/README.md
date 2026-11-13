# Real notebook host checks

These scripts exercise installed applications, using isolated VS Code profiles. Install the release wheel in `/tmp/heatmap-python-venv`, with JupyterLab, Notebook 7, ipykernel and the VS Code Python/Jupyter extensions available.

Copy `fixture.ipynb` to `/tmp/heatmap-notebook-validation/frames-lab.ipynb`, `frames-notebook.ipynb`, and `frames-vscode.ipynb`. Start Jupyter from that environment on port 8894 with that root and token `heatmap-local-test`, then run `node tests/notebook/stabilization/notebooks.mjs`. `NOTEBOOK_URL` and `NOTEBOOK_TOKEN` override the server.

Run `vscode.mjs` with the normal development server on port 5184. Run `vscode-notebook.mjs` for the real notebook webview. `VSCODE_EXECUTABLE` overrides the macOS application path, and `NOTEBOOK_KERNEL_LABEL` overrides the kernel picker label. These UI drivers use macOS keyboard shortcuts and may need adapting to other platforms or changed application menus. They do not modify the user's normal VS Code profile. Run hosts sequentially.

The notebook browser check performs rendering, binary updates, histogram changes, settlement and PNG export. The VS Code notebook check verifies real widget rendering; the separate integrated-browser check exercises mode/data/visibility changes. Neither is a claim of exhaustive notebook interaction coverage.
