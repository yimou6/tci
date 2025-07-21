import gulp from 'gulp';
import ts from 'gulp-typescript';
import terser from 'gulp-terser';
import { deleteAsync } from 'del';

// 从 tsconfig.json 加载项目配置
const tsProject = ts.createProject('tsconfig.json');

/**
 * 清理 dist 目录
 */
export const clean = () => deleteAsync(['dist']);

/**
 * 编译、压缩 TypeScript 文件
 */
export const scripts = () => {
  return tsProject
    .src()
    .pipe(tsProject()) // 使用 tsconfig.json 编译
    .js.pipe(
      terser({
        compress: true, // 压缩代码
        mangle: true, // 混淆变量名
        format: {
          comments: false, // 移除所有注释
        },
      })
    )
    .pipe(gulp.dest(tsProject.options.outDir)); // 输出到 tsconfig.json 中定义的 outDir
};

/**
 * 构建任务，先清理再编译
 */
const build = gulp.series(clean, scripts);

export default build;