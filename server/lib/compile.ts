export function compileProject(files: Record<string, { content: string; type: string }>) {
  // Find the entry HTML file
  const entryFile = Object.entries(files).find(
    ([name]) => name === 'index.html' || name.endsWith('.html')
  );

  if (!entryFile) {
    throw new Error('No HTML entry file found');
  }

  let entryHTML = entryFile[1].content;

  // Collect all CSS
  const allCSS = Object.entries(files)
    .filter(([name]) => name.endsWith('.css'))
    .map(([_, file]) => file.content)
    .join('\n');

  // Collect all JavaScript
  const allJS = Object.entries(files)
    .filter(([name]) => name.endsWith('.js'))
    .map(([_, file]) => file.content)
    .join(';\n');

  // Inject CSS before </head>
  if (allCSS && entryHTML.includes('</head>')) {
    entryHTML = entryHTML.replace(
      '</head>',
      `<style>${allCSS}</style></head>`
    );
  } else if (allCSS) {
    // If no </head>, inject at beginning
    entryHTML = `<style>${allCSS}</style>${entryHTML}`;
  }

  // Inject JavaScript before </body>
  if (allJS && entryHTML.includes('</body>')) {
    entryHTML = entryHTML.replace(
      '</body>',
      `<script>${allJS}</script></body>`
    );
  } else if (allJS) {
    // If no </body>, inject at end
    entryHTML = `${entryHTML}<script>${allJS}</script>`;
  }

  return entryHTML;
}