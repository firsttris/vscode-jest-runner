module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^vscode$': 'src/test/__mocks__/vscode.ts',
  },
};
