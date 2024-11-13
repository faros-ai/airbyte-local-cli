import {exec} from 'node:child_process';

import {checkDockerInstalled} from '../src/utils';

jest.mock('node:child_process', () => ({
  exec: jest.fn(),
}));

afterEach(() => {
  jest.resetAllMocks();
});

describe('Check docker installed', () => {
  it('should pass if docker is installed', async () => {
    (exec as unknown as jest.Mock).mockImplementation((_command, callback) => {
      callback(null, 'Docker version 27.0.3', '');
    });
    await expect(checkDockerInstalled()).resolves.toBeUndefined();
  });

  it('should fail if docker is not installed', async () => {
    (exec as unknown as jest.Mock).mockImplementation((_command, callback) => {
      callback(new Error('Docker is not installed.'), '', '');
    });
    await expect(checkDockerInstalled()).rejects.toThrow('Docker is not installed.');
  });
});
