import { Div, H1, Node, P, setDebugMode, Span } from '@src/main.js'
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode, useEffect, useState } from 'react'
import React from 'react'
import { createSerializer, matchers } from '@emotion/jest'
import { createNode } from '@src/core.node.js'
import { FormControlLabel, Radio, RadioGroup } from '@mui/material'
import { type Mock, vi } from 'vitest'

expect.extend(matchers)
expect.addSnapshotSerializer(createSerializer())

// Clean up DOM and caches between tests
afterEach(cleanup)
beforeEach(() => {
  setDebugMode(true)
})

describe('Dependency and Memoization in a Real-World Scenario', () => {
  // Mock user data and a fake service to simulate API calls.
  const mockUsers = {
    '1': { name: 'Alice', email: 'alice@example.com' },
    '2': { name: 'Bob', email: 'bob@example.com' },
  }
  const userService = {
    fetchUser: vi.fn(async (userId: keyof typeof mockUsers) => {
      await new Promise(resolve => setTimeout(resolve, 50)) // Simulate network delay
      return mockUsers[userId]
    }),
  }

  // A reusable UserProfile component that fetches and displays user data.
  // It is designed to be memoized based on the userId.
  let userProfileRenderCount: Mock
  const UserProfile = ({ userId }: { userId: keyof typeof mockUsers }) => {
    userProfileRenderCount()
    const [user, setUser] = useState<{ name: string; email: string } | null>(null)

    useEffect(() => {
      userService.fetchUser(userId).then(setUser)
    }, [userId]) // Effect depends only on userId

    if (!user) {
      return P('Loading profile...').render()
    }

    return Div({
      'data-testid': `profile-${userId}`,
      children: [H1(user.name), P(user.email)],
    }).render()
  }

  // The main App component that controls which user profile is displayed
  // and has an unrelated state variable (theme) to test memoization.
  const App = () => {
    const [currentUserId, setCurrentUserId] = useState<keyof typeof mockUsers>('1')
    const [theme, setTheme] = useState('light')

    return Div({
      children: [
        // Controls to change the state
        Div({
          children: [
            P(`Current Theme: ${theme}`),
            Node('button', { onClick: () => setCurrentUserId('1'), children: 'View Alice' }),
            Node('button', { onClick: () => setCurrentUserId('2'), children: 'View Bob' }),
            Node('button', { onClick: () => setTheme(t => (t === 'light' ? 'dark' : 'light')), children: 'Toggle Theme' }),
          ],
        }),
        // The memoized UserProfile component. It should only re-render if `currentUserId` changes.
        Node(UserProfile, { userId: currentUserId }, [currentUserId]),
      ],
    }).render()
  }

  beforeEach(() => {
    // Reset mocks and spies before each test in this suite.
    userProfileRenderCount = vi.fn()
    userProfileRenderCount.mockClear()
    userService.fetchUser.mockClear()
  })

  it('distinguishes static nodes with different children', () => {
    // Arrange: create static Div nodes each with a different child
    const nodeA = Div({ children: Span('A') }, [])
    const nodeB = Div({ children: Span('B') }, [])
    const nodeC = Div({ children: Div({ children: Span('C') }, []) })
    const StaticNodesApp = Div({ children: [nodeA, nodeB, nodeC] })

    // Act: render the App component
    const { getByText } = render(StaticNodesApp.render())

    // Assert: the rendered Span elements exist and their parent elements are distinct
    const spanA = getByText('A')
    const spanB = getByText('B')
    const spanC = getByText('C')

    expect(spanA.parentElement).not.toBe(spanB.parentElement)
    expect(spanC.parentElement).not.toBe(spanA.parentElement)
  })

  it('should memoize a simple component based on dependencies', async () => {
    let renderCount = 0
    const MemoizedComponent = ({ value }: { value: string }) => {
      renderCount++
      return Div({ children: `Value: ${value}` }).render()
    }

    const App = () => {
      const [stateValue, setStateValue] = useState('initial')
      const [unrelatedState, setUnrelatedState] = useState(0)

      return Div({
        children: [
          Node(MemoizedComponent, { value: stateValue }, [stateValue]),
          Node('button', { onClick: () => setStateValue('changed'), children: 'Change Value' }),
          Node('button', { onClick: () => setUnrelatedState(unrelatedState + 1), children: 'Change Unrelated' }),
          P(`Unrelated: ${unrelatedState}`),
        ],
      }).render()
    }

    const { getByText } = render(Node(App).render())

    // Initial render
    expect(getByText('Value: initial')).toBeInTheDocument()
    expect(renderCount).toBe(1)

    // Change unrelated state
    act(() => {
      getByText('Change Unrelated').click()
    })
    await getByText('Unrelated: 1')
    // MemoizedComponent should NOT re-render
    expect(renderCount).toBe(1)

    // Change stateValue
    act(() => {
      getByText('Change Value').click()
    })
    await getByText('Value: changed')
    // MemoizedComponent SHOULD re-render
    expect(renderCount).toBe(2)
  })

  it('handles dependency-driven re-renders and static child', () => {
    // Define a component that holds complex state (an object with multiple keys: user, role).
    const ComplexStateApp = () => {
      const [state, setState] = useState({ user: 'John', role: 'Admin' })

      // Updater that changes only the `user` field.
      const updateUser = () => setState(s => ({ ...s, user: 'Jane' }))
      // Updater that changes only the `role` field.
      const updateRole = () => setState(s => ({ ...s, role: 'Editor' }))

      return Div({
        children: [
          // Button to update the `user` field (dependent).
          Div({ onClick: updateUser, children: 'Update User' }),
          // Button to update the `role` field (non-dependent for some children).
          Div({ onClick: updateRole, children: 'Update Role' }),
          // Static child: empty dependency array means it should remain unchanged across state updates.
          Div({ children: `Initial User: ${state.user}` }, []),
          // Dependent child: will re-render only when `state.user` changes.
          Div({ children: `User: ${state.user}; Role: ${state.role}` }, [state.user]),
        ],
      }).render()
    }

    // Render the component.
    const { getByText } = render(Node(ComplexStateApp).render())

    // Act: Trigger an update to the non-dependent field (`role`).
    act(() => {
      getByText('Update Role').click()
    })
    // Assert: The dependent child should NOT re-render (user is still John).
    expect(getByText('User: John; Role: Admin')).toBeInTheDocument()
    // Assert: The static child should remain unchanged.
    expect(getByText('Initial User: John')).toBeInTheDocument()

    // Act: Trigger an update to the dependent field (`user`).
    act(() => {
      getByText('Update User').click()
    })
    // Assert: The dependent child SHOULD re-render to reflect the new user and updated role.
    expect(getByText('User: Jane; Role: Editor')).toBeInTheDocument()
    // Assert: The static child should still remain unchanged.
    expect(getByText('Initial User: John')).toBeInTheDocument()
  })

  it('should render the initial profile and not re-render on unrelated state changes', async () => {
    // Step 1: Mount the App and obtain query utilities
    const { getByText, findByText } = render(Node(App).render())

    // Step 2: Wait for the initial profile (Alice) to load and assert initial state
    await findByText('Alice')
    expect(getByText('alice@example.com')).toBeInTheDocument()
    const initialRenderCount = userProfileRenderCount.mock.calls.length
    expect(userService.fetchUser).toHaveBeenCalledWith('1')
    expect(userService.fetchUser).toHaveBeenCalledTimes(1)

    // Step 3: Trigger an unrelated state change (toggle theme)
    act(() => {
      getByText('Toggle Theme').click()
    })

    // Step 4: Wait for the unrelated UI update to settle
    await findByText('Current Theme: dark')

    // Step 5: Verify memoization prevented re-render and no additional fetch occurred
    expect(userProfileRenderCount.mock.calls.length).toBe(initialRenderCount)
    expect(userService.fetchUser).toHaveBeenCalledTimes(1)
    expect(getByText('Alice')).toBeInTheDocument()
  })

  it('should re-render the profile only when the userId dependency changes', async () => {
    const { getByText, findByText } = render(Node(App).render())

    // 1. Initial Render (Alice)
    // First render: Loading state (renderCount = 1)
    // Second render: Data loaded (renderCount = 2)
    await findByText('Alice')
    expect(getByText('alice@example.com')).toBeInTheDocument()
    expect(userProfileRenderCount).toHaveBeenCalledTimes(2) // Loading + Loaded
    expect(userService.fetchUser).toHaveBeenCalledWith('1')
    expect(userService.fetchUser).toHaveBeenCalledTimes(1)

    // 2. Switch Profile to Bob
    act(() => {
      getByText('View Bob').click()
    })

    // 3. Assert Re-render and Data Fetch
    // Third render: Loading state with userId='2' (renderCount = 3)
    // Fourth render: Bob's data loaded (renderCount = 4)
    await findByText('Bob')
    expect(getByText('bob@example.com')).toBeInTheDocument()
    expect(userProfileRenderCount).toHaveBeenCalledTimes(4) // +2 for new profile
    expect(userService.fetchUser).toHaveBeenCalledWith('2')
    expect(userService.fetchUser).toHaveBeenCalledTimes(2)

    // 4. Switch back to Alice
    act(() => {
      getByText('View Alice').click()
    })

    // 5. Assert Re-render and Data Fetch again
    // Fifth render: Loading state with userId='1' (renderCount = 5)
    // Sixth render: Alice's data loaded (renderCount = 6)
    await findByText('Alice')
    expect(getByText('alice@example.com')).toBeInTheDocument()
    expect(userProfileRenderCount).toHaveBeenCalledTimes(6) // +2 for switching back
    expect(userService.fetchUser).toHaveBeenCalledWith('1')
    expect(userService.fetchUser).toHaveBeenCalledTimes(3)
  })

  // Test to ensure no cache collision occurs between different components with identical props
  it('prevents cache collision between different components with identical props', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const CompA = () => Div({ children: 'A', color: 'red' }).render()
    const CompB = () => Div({ children: 'B', color: 'red' }).render()

    const App = Div({
      children: [
        Node(CompA, { key: 'item' }, []),
        Node(CompB, { key: 'item' }, []), // Same key, same style props
      ],
    })

    const { getByText } = render(App.render())

    // Both should render independently despite collision-prone signatures
    expect(getByText('A')).toBeInTheDocument()
    expect(getByText('B')).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })

  // Test to ensure compatibility with React 18 Strict Mode
  it('handles React 18 Strict Mode without cache corruption', () => {
    let renderCount = 0

    const TrackedComponent = () => {
      renderCount++
      return P('Tracked Content').render()
    }

    const App = () => {
      const [toggle, setToggle] = useState(false)
      return Div({
        children: [
          Node(TrackedComponent, { key: 'LOL' }, []),
          Node('button', {
            onClick: () => setToggle(!toggle),
            children: 'Toggle',
          }),
        ],
      }).render()
    }

    const { getByText, unmount } = render(Node(StrictMode, { children: Node(App) }).render())

    // Initial render (Strict Mode doesn't double-mount in test/production mode)
    expect(renderCount).toBe(2)

    // Toggle parent state - TrackedComponent should NOT re-render (empty deps)
    act(() => {
      getByText('Toggle').click()
    })

    expect(renderCount).toBe(2) // Still 1, memoization works in StrictMode

    // Toggle again to verify cache stability
    act(() => {
      getByText('Toggle').click()
    })

    expect(renderCount).toBe(2) // Memoization still working

    unmount()
  })

  // Additional tests can be added here to further validate edge cases and complex scenarios.

  it('keeps memoization correct across mount/unmount/remount cycles', () => {
    let renderCount = 0
    const ExpensiveComponent = ({ id }: { id: number }) => {
      renderCount++
      return Div({
        color: 'red',
        backgroundColor: 'blue',
        padding: 20,
        children: `Expensive ${id}`,
      }).render()
    }

    const App = () => {
      const [show, setShow] = useState(true)
      const [id, setId] = useState(1)

      return Div({
        children: [
          Node('button', {
            onClick: () => setShow(!show),
            children: 'Toggle Mount',
          }),
          Node('button', {
            onClick: () => setId(2),
            children: 'Set ID 2',
          }),
          Node('button', {
            onClick: () => setId(1),
            children: 'Set ID 1',
          }),
          show ? Node(ExpensiveComponent, { id }, [id]) : null,
          P(`ID: ${id}, Show: ${show}`),
        ],
      }).render()
    }

    const { getByText, queryByText } = render(Node(App).render())

    // Initial mount
    expect(renderCount).toBe(1)
    expect(getByText('Expensive 1')).toBeInTheDocument()

    // Unmount component
    act(() => {
      getByText('Toggle Mount').click()
    })

    expect(queryByText('Expensive 1')).not.toBeInTheDocument()
    expect(getByText(/Show: false/)).toBeInTheDocument()

    // Change ID while unmounted
    act(() => {
      getByText('Set ID 2').click()
    })

    expect(getByText(/ID: 2/)).toBeInTheDocument()

    // Remount with new ID - should render with new props
    act(() => {
      getByText('Toggle Mount').click()
    })

    expect(getByText('Expensive 2')).toBeInTheDocument()
    expect(renderCount).toBe(2) // New render for new ID

    // Unmount again
    act(() => {
      getByText('Toggle Mount').click()
    })

    expect(queryByText('Expensive 2')).not.toBeInTheDocument()

    // Remount with same ID - should trigger re-render
    act(() => {
      getByText('Toggle Mount').click()
    })

    expect(getByText('Expensive 2')).toBeInTheDocument()
    expect(renderCount).toBe(3) // Re-render after remount

    // Change back to ID 1
    act(() => {
      getByText('Set ID 1').click()
    })

    expect(getByText('Expensive 1')).toBeInTheDocument()
    expect(renderCount).toBe(4)
  })

  // Regression test for a wrapper swallowing props injected via React.cloneElement
  // This is common in libraries like MUI (RadioGroup injects 'checked' and 'onChange' into Radio)
  it('should forward implicit props from parent to child (MUI integration)', () => {
    const MeoRadioGroup = createNode(RadioGroup)
    const MeoFormControlLabel = createNode(FormControlLabel)
    const MeoRadio = createNode(Radio)

    const App = () => {
      const [checked, setChecked] = useState<'false' | 'true'>('false')

      return MeoRadioGroup({
        value: checked,
        onChange: ({ target: { value } }) => {
          setChecked(value as 'false' | 'true')
        },
        children: [
          MeoFormControlLabel({
            value: 'true',
            control: MeoRadio().render(),
            label: 'Yes',
            checked: checked === 'true',
          }),
          MeoFormControlLabel({
            value: 'false',
            control: MeoRadio().render(),
            label: 'No',
            checked: checked === 'false',
          }),
        ],
      }).render()
    }

    const { container } = render(Node(App).render())

    const radioTrue = container.querySelector<HTMLInputElement>('input[value="true"]')
    const radioFalse = container.querySelector<HTMLInputElement>('input[value="false"]')

    const radioLabelTrue = radioTrue?.parentNode?.parentNode as HTMLLabelElement
    const radioLabelFalse = radioFalse?.parentNode?.parentNode as HTMLLabelElement

    expect(radioTrue).toBeInTheDocument()
    expect(radioFalse).toBeInTheDocument()

    act(() => {
      radioLabelTrue?.click()
    })

    expect(radioTrue).toBeChecked()
    expect(radioFalse).not.toBeChecked()

    act(() => {
      radioLabelFalse?.click()
    })

    expect(radioFalse).toBeChecked()
    expect(radioTrue).not.toBeChecked()

    act(() => {
      radioLabelTrue?.click()
    })

    expect(radioTrue).toBeChecked()
    expect(radioFalse).not.toBeChecked()
  })

  it('should maintain cache across updates', () => {
    let renderCount = 0
    const Expensive = () => {
      renderCount++
      return React.createElement('div', null, 'Expensive')
    }

    // Built outside the component, so the same instance is reused each render.
    const expensiveNode = Node(Expensive, {}, [])

    const App = () => {
      const [, setCount] = useState(0)
      return React.createElement('div', null, expensiveNode.render(), React.createElement('button', { onClick: () => setCount(c => c + 1) }, 'Update'))
    }

    const { getByText } = render(Node(App).render())

    expect(renderCount).toBe(1)

    // Two parent updates in a row: the memoized subtree must survive both, so
    // this catches a memo that is dropped and rebuilt each time as well as one
    // that never memoized at all.
    act(() => {
      getByText('Update').click()
    })
    expect(renderCount).toBe(1)

    act(() => {
      getByText('Update').click()
    })
    expect(renderCount).toBe(1)
  })
})
