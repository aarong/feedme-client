import gulp from "gulp";
import del from "del";
import sourcemaps from "gulp-sourcemaps";
import rename from "gulp-rename";
import browserify from "browserify";
import source from "vinyl-source-stream";
import buffer from "vinyl-buffer";
import babel from "gulp-babel";
import uglify from "gulp-uglify";
import path from "path";

const clean = () => del(path.join(__dirname, "build"));

/*

Problem with es6-npm-boilerplate: Browserify was not applying the Babelify plugin
to external dependencies, but it was rolling up the code. As a result,
I use Gulp to pipe the output through Babel again and then Uglify it (the latter
does not support ES6).

Works in any path. Gulp.src/dest are always relative to package root (Gulpfile).

*/
const browserBundle = () => {
  const b = browserify({
    entries: path.join(__dirname, "src/main.browser.js"),
    debug: true,
    standalone: "feedmeClient"
  });

  return b
    .transform("babelify", {
      presets: [["@babel/preset-env", { targets: "> 0.25%, not dead" }]] // Working?
    })
    .bundle()
    .pipe(source("bundle.js"))
    .pipe(buffer())
    .pipe(sourcemaps.init({ loadMaps: true })) // Browserify source maps are piped in
    .pipe(babel({ plugins: ["add-module-exports"] })) // No feedmeClient.default({})
    .pipe(uglify())
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest(path.join(__dirname, "build")));
};

const nodeTranspile = () =>
  gulp
    .src(["src/*.js", "!src/main.browser.js"]) // Don't transpile the browser entry-point
    .pipe(sourcemaps.init())
    .pipe(babel({ plugins: ["add-module-exports"] })) // No feedmeClient.default({})
    .pipe(sourcemaps.mapSources(sourcePath => `../src/${sourcePath}`))
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest("build/"));

const copy1 = () =>
  gulp
    .src("./index.build.js")
    .pipe(rename("index.js"))
    .pipe(gulp.dest("build/"));

const copy2 = () =>
  gulp.src("./{package.json,LICENSE,README.md}").pipe(gulp.dest("build/"));

export const build = gulp.series(
  // eslint-disable-line import/prefer-default-export
  clean,
  browserBundle,
  nodeTranspile,
  copy1,
  copy2
);
