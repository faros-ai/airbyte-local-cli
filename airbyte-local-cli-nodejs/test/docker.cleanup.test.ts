import * as docker from '../src/docker';
import {AirbyteCliContext} from '../src/types';

describe('Container Cleanup', () => {
  let mockContainer: any;
  let mockDocker: any;
  
  beforeEach(() => {
    mockContainer = {
      stop: jest.fn().mockResolvedValue(undefined),
    };
    
    mockDocker = {
      getContainer: jest.fn().mockReturnValue(mockContainer),
    };
    
    docker.setDocker(mockDocker);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  it('should stop containers with default timeout', async () => {
    const containerIds = ['container1', 'container2', 'container3'];
    
    await docker.stopContainers(containerIds);
    
    expect(mockDocker.getContainer).toHaveBeenCalledTimes(3);
    expect(mockDocker.getContainer).toHaveBeenCalledWith('container1');
    expect(mockDocker.getContainer).toHaveBeenCalledWith('container2');
    expect(mockDocker.getContainer).toHaveBeenCalledWith('container3');
    
    expect(mockContainer.stop).toHaveBeenCalledTimes(3);
    expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
  });
  
  it('should stop containers with custom timeout', async () => {
    const containerIds = ['container1', 'container2'];
    const customTimeout = 5;
    
    await docker.stopContainers(containerIds, customTimeout);
    
    expect(mockContainer.stop).toHaveBeenCalledTimes(2);
    expect(mockContainer.stop).toHaveBeenCalledWith({ t: customTimeout });
  });
  
  it('should handle empty container array', async () => {
    await docker.stopContainers([]);
    
    expect(mockDocker.getContainer).not.toHaveBeenCalled();
    expect(mockContainer.stop).not.toHaveBeenCalled();
  });
  
  it('should handle container stop errors', async () => {
    const containerIds = ['container1', 'container2'];
    
    mockDocker.getContainer.mockImplementation((id) => {
      if (id === 'container2') {
        return {
          stop: jest.fn().mockRejectedValue(new Error('Container already stopped')),
        };
      }
      return mockContainer;
    });
    
    await expect(docker.stopContainers(containerIds)).resolves.not.toThrow();
    
    expect(mockContainer.stop).toHaveBeenCalledTimes(1);
  });
});
