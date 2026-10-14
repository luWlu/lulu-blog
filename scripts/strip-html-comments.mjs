/** 将 Markdown 的编辑注释留在源文件侧，不输出到文章 HTML。 */
export default function stripHtmlComments() {
  return tree => {
    function walk(node) {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.filter(child => {
        if (child.type !== 'html') return true;
        child.value = child.value.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
        return child.value.trim().length > 0;
      });
      node.children.forEach(walk);
    }
    walk(tree);
  };
}
