import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';

import {checkDockerInstalled, cleanUp, createTmpDir, loadStateFile, parseConfigFile} from '../src/utils';

describe('parseConfigFile', () => {
  it('should pass', () => {
    expect(parseConfigFile('test/resources/test_config_file.json')).toMatchSnapshot();
  });
  it('should fail with invalid json', () => {
    expect(() => parseConfigFile('test_config_file_invalid')).toThrow();
  });
});

describe('checkDockerInstalled', () => {
  it('should pass if docker is installed', () => {
    expect(checkDockerInstalled('pwd', [])).toBeUndefined();
  });

  it('should fail if docker is not installed', () => {
    expect(() => checkDockerInstalled('bad-command')).toThrow();
  });
});

describe('createTmpDir', () => {
  it('should pass', () => {
    const tmpDirPath = createTmpDir();
    expect(existsSync(tmpDirPath)).toBe(true);
    expect(() => cleanUp({tmpDir: tmpDirPath})).not.toThrow();
  });

  it('should pass with non default dir', () => {
    const tmpDirPath = createTmpDir(`test/test-tmp-dir`);
    expect(existsSync(tmpDirPath)).toBe(true);
    expect(() => cleanUp({tmpDir: tmpDirPath})).not.toThrow();
  });
});

describe('loadStateFile', () => {
  let tmpDirPath: string;
  beforeAll(() => {
    tmpDirPath = mkdtempSync('test-temp-dir');
  });
  afterAll(() => {
    rmSync(tmpDirPath, {recursive: true, force: true});
  });

  it('should pass without existing state file', () => {
    expect(() => loadStateFile(tmpDirPath)).not.toThrow();
    expect(existsSync(`${tmpDirPath}/state.json`)).toBe(true);
    expect(readFileSync(`${tmpDirPath}/state.json`, 'utf8')).toBe('{}');
  });

  it('should pass with existing state file', () => {
    const testStateFile = 'test/resources/test__state.json';
    expect(() => loadStateFile(tmpDirPath, testStateFile)).not.toThrow();
    expect(existsSync(`${tmpDirPath}/state.json`)).toBe(true);
    expect(readFileSync(`${tmpDirPath}/state.json`, 'utf8')).toMatchSnapshot();
  });

  it('should fail if state file is not loaded', () => {
    expect(() => loadStateFile(tmpDirPath, 'non-exist-state-file')).toThrow(
      `State file 'non-exist-state-file' not found. Please make sure the state file exists and have read access.`,
    );
  });
});
