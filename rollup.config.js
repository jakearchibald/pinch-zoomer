import commonjs from 'rollup-plugin-commonjs';
import nodeResolve from 'rollup-plugin-node-resolve';

export default {
  entry: 'index.js',
  format: 'iife',
  //dest: 'dist/index.js',
  moduleName: 'PinchZoomer',
  plugins: [
    nodeResolve({
      jsnext: true,
      browser: true
    }),
    commonjs({
      namedExports: {
        'node_modules/gl-matrix/src/gl-matrix/mat2d.js': ['create']
      }
    })
  ]
};