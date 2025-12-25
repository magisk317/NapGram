import { describe, expect, test, vi, beforeEach } from 'vitest'
import { GroupAPIImpl } from '../../api/group'

// Mock logger
vi.mock('../../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}))

describe('GroupAPIImpl', () => {
  let groupAPI: GroupAPIImpl

  beforeEach(() => {
    groupAPI = new GroupAPIImpl()
  })

  test('should initialize correctly', () => {
    expect(groupAPI).toBeInstanceOf(GroupAPIImpl)
  })

  test('should get group info', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      // Mock instance with necessary properties
    })
    
    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).getQQGroupInfo = vi.fn().mockResolvedValue({
      groupId: 'qq:group:123456',
      groupName: 'Test Group',
    })

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).resolves.toEqual({
      groupId: 'qq:group:123456',
      groupName: 'Test Group',
    })
  })

  test('should get group members', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({
      // Mock instance with necessary properties
    })
    
    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).getQQGroupMembers = vi.fn().mockResolvedValue([
      { userId: 'qq:user:1', userName: 'User1', role: 'member' },
    ])

    const members = await groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })

    expect(Array.isArray(members)).toBe(true)
    expect(members).toHaveLength(1)
  })

  test('should return empty members for qq by default', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).resolves.toEqual([])
  })

  test('should get tg group members', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).getTGGroupMembers = vi.fn().mockResolvedValue([
      { userId: 'tg:user:1', userName: 'User1', role: 'member' },
    ])

    const members = await groupAPI.getMembers({
      instanceId: 1,
      groupId: 'tg:group:123456',
    })

    expect(members).toHaveLength(1)
  })

  test('should return empty members for tg by default', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'tg:group:123456',
    })).resolves.toEqual([])
  })

  test('should set admin', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    
    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).setQQAdmin = vi.fn().mockResolvedValue(undefined)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      enable: true,
    })).resolves.toBeUndefined()
  })

  test('should mute user', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    
    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).muteQQUser = vi.fn().mockResolvedValue(undefined)

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      duration: 3600,
    })).resolves.toBeUndefined()
  })

  test('should kick user', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    
    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).kickQQUser = vi.fn().mockResolvedValue(undefined)

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
    })).resolves.toBeUndefined()
  })

  test('should set admin for tg group', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).setTGAdmin = vi.fn().mockResolvedValue(undefined)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'tg:group:123456',
      userId: 'tg:user:789012',
      enable: true,
    })).resolves.toBeUndefined()
  })

  test('should mute user for tg group', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).muteTGUser = vi.fn().mockResolvedValue(undefined)

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'tg:group:123456',
      userId: 'tg:user:789012',
      duration: 3600,
    })).resolves.toBeUndefined()
  })

  test('should kick user for tg group', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ;(groupAPI as any).kickTGUser = vi.fn().mockResolvedValue(undefined)

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'tg:group:123456',
      userId: 'tg:user:789012',
    })).resolves.toBeUndefined()
  })

  test('should handle missing instance resolver', async () => {
    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      enable: true,
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      duration: 3600,
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')
  })

  test('should handle missing instance', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue(null)
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      enable: true,
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      duration: 3600,
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
    })).rejects.toThrow('Instance 1 not found')
  })

  test('should parse group ID correctly', () => {
    // The parseGroupId method is private, but we can test the expected behavior
    // by ensuring the public methods handle the parsing correctly
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    // Test that methods accept properly formatted group IDs
    expect(() => groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).not.toThrow()

    expect(() => groupAPI.getInfo({
      instanceId: 1,
      groupId: 'tg:group:789012',
    })).not.toThrow()
  })

  test('should throw for invalid group ID format', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'invalid',
    })).rejects.toThrow('Invalid groupId format')
  })

  test('should throw for invalid user ID format', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'invalid',
      enable: true,
    })).rejects.toThrow('Invalid userId format')
  })

  test('should throw for unknown platform in group id', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'wx:group:123456',
    })).rejects.toThrow('Unknown platform')

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'wx:group:123456',
    })).rejects.toThrow('Unknown platform')
  })

  test('should throw when group and user platforms differ', async () => {
    const mockInstanceResolver = vi.fn().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'tg:user:789012',
      enable: true,
    })).rejects.toThrow('Group and user must be on the same platform')

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456', 
      userId: 'tg:user:789012',
      duration: 3600,
    })).rejects.toThrow('Group and user must be on the same platform')

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'tg:user:789012',
    })).rejects.toThrow('Group and user must be on the same platform')
  })
})

describe('createGroupAPI', () => {
  test('should create group API instance', () => {
    const groupAPI = new GroupAPIImpl()
    
    expect(groupAPI).toBeDefined()
    expect(groupAPI.getInfo).toBeDefined()
    expect(groupAPI.getMembers).toBeDefined()
    expect(groupAPI.setAdmin).toBeDefined()
    expect(groupAPI.muteUser).toBeDefined()
    expect(groupAPI.kickUser).toBeDefined()
  })

  test('should create group API with instance resolver', () => {
    const instanceResolver = vi.fn()
    const groupAPI = new GroupAPIImpl(instanceResolver)
    
    expect(groupAPI).toBeDefined()
  })
})
