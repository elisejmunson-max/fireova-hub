const Module = require('module')
const path = require('path')

const buildDir = path.resolve(process.env.TEST_BUILD_DIR || '.test-build')
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    return originalResolveFilename.call(this, path.join(buildDir, request.slice(2)), parent, isMain, options)
  }

  return originalResolveFilename.call(this, request, parent, isMain, options)
}
