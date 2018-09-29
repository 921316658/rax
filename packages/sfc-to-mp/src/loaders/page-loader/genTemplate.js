const { join, resolve, parse, dirname, extname } = require('path');
const { readFileSync } = require('fs');
const babel = require('babel-core');

const { parseSFCParts } = require('../../transpiler/parse');
const { parseComponentsDeps } = require('./parser');
const compileES5 = require('./compileES5');
const genTemplateName = require('./genTemplateName');
const transpiler = require('../../transpiler');
const getExt = require('../../config/getExt');
const { OUTPUT_SOURCE_FOLDER } = require('../../config/CONSTANTS');

module.exports = function genTemplate({
  path,
  tplName,
  pageName,
  modulePath,
}) {
  const templateExt = getExt('template');
  const styleExt = getExt('style');
  const scriptExt = getExt('script');

  const files = [];

  const content = readFileSync(path, 'utf-8');
  const { script, styles, template } = parseSFCParts(content);

  const tplImports = {};

  const pageBase = join(pageName, '..', modulePath);
  if (script) {
    const babelResult = babel.transform(script.content, {
      plugins: [parseComponentsDeps],
    });
    const {
      components: importedComponentsMap,
    } = babelResult.metadata;
    Object.keys(importedComponentsMap || {}).forEach(tagName => {
      let modulePath = importedComponentsMap[tagName];

      const { name } = parse(modulePath);
      const vueModulePath = resolve(dirname(path), modulePath);

      const tplName = genTemplateName(vueModulePath);
      /**
       * name: 模块名称, name="title"
       * tplName: sfc2mp 生成的唯一名称, 用于 import 和生成 axml
       */
      tplImports[tagName] = {
        tagName,
        tplName,
        filename: name,
      };
      const tplReq = `/${OUTPUT_SOURCE_FOLDER}/components/${tplName}${templateExt}`;

      const { contents, files: depsFiles, originPath } = genTemplate({
        path:
          extname(vueModulePath) === '.html' // XXXX 只
            ? vueModulePath
            : vueModulePath + '.html',
        tplName,
        pageName: pageBase,
        modulePath,
        name,
      });

      files.push({
        path: tplReq.slice(1),
        contents: contents,
        originPath: originPath,
        children: depsFiles,
      });
    });
  }

  const { template: tpl } = transpiler(template.content, {
    tplImports,
    isTemplateoriginPath: true,
    templateName: tplName,
  });

  let scriptCode = 'module.exports = {};';
  if (script) {
    const { code } = compileES5(script.content);
    scriptCode = code;
  }

  /**
   * 生成组件样式
   */
  if (Array.isArray(styles)) {
    const style = styles.map(s => s.content).join('\n');

    files.unshift({
      path: `${OUTPUT_SOURCE_FOLDER}/components/${tplName}${styleExt}`,
      contents: style,
    });
  }

  /**
   * 生成组件 js context
   */
  const scriptPath = join(
    OUTPUT_SOURCE_FOLDER,
    pageName,
    '..',
    modulePath + scriptExt
  );

  files.unshift({
    path: scriptPath,
    contents: scriptCode,
  });

  const codes = [
    // 注册 template
    `<template name="${tplName}">`,
    tpl,
    '</template>',
  ];

  Object.keys(tplImports).forEach(name => {
    const { tplName } = tplImports[name];
    codes.unshift(
      `<import src="/${OUTPUT_SOURCE_FOLDER}/components/${tplName}${templateExt}" />`
    );
  });

  return { contents: codes.join('\n'), files, originPath: path };
};