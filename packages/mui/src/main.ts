'use strict'
import * as Mui from '@mui/material'
import * as MuiStyles from '@mui/material/styles'
import { ComponentType } from 'react'
import type { BaseNodeInstance, RawNodeProps, NodeElement, NodeProps } from '@meonode/ui'
import { Node, getComponentType } from '@meonode/ui'

/**
 * Validates whether a MUI export should be wrapped as a renderable React component.
 * This function performs comprehensive validation to ensure the component can be properly rendered.
 * @param component The MUI component or export to validate
 * @param componentName The name of the component being checked
 * @returns A type predicate indicating if the component is renderable
 * @remarks
 * The validation includes multiple checks:
 * - Existence of the muiName static property (common in MUI components)
 * - Component naming conventions (capitalized for React components)
 * - Class component structure (presence of render method or isReactComponent)
 * - Forward ref and memo component patterns
 * @example
 * ```ts
 * // Check if the Button component is renderable
 * if (isRenderableMuiComponent(Mui.Button, 'Button')) {
 *   // Safe to use Button as a React component
 * }
 * ```
 */
export function isRenderableMuiComponent(component: any, componentName: string): component is ComponentType<any> {
  if (component == null) return false

  const componentType = getComponentType(component)

  if ((componentType === 'object' || componentType === 'function') && Object.prototype.hasOwnProperty.call(component, 'muiName')) {
    return true
  }

  if (componentType === 'function') {
    return (
      /^[A-Z]/.test(componentName) ||
      ('prototype' in component && component.prototype === 'object' && component.prototype !== null && 'isReactComponent' in component.prototype)
    )
  }

  if (componentType === 'forwardRef' && typeof component.render === 'function') {
    return true
  }

  if (componentType === 'memo' && Object.hasOwn(component, 'type')) {
    return isRenderableMuiComponent(component.type, componentName)
  }

  if (componentType === 'object') {
    return <boolean>(
      (/^[A-Z]/.test(componentName) &&
        (typeof component.render === 'function' ||
          (component.prototype && typeof component.prototype === 'object' && 'isReactComponent' in component.prototype)))
    )
  }

  return false
}

/**
 * Factory function type for creating wrapped MUI components.
 * Takes optional props and returns a BaseNodeInstance that can be rendered.
 * @template C - The MUI component type to wrap
 * @returns A BaseNodeInstance representing the wrapped component
 * @example
 * ```ts
 * type ButtonFactory = WrappedMuiComponentFactory<typeof Button>;
 * const wrappedButton: ButtonFactory = (props) => Node(Button, props);
 * wrappedButton({ variant: 'contained', children: 'Click me' });
 * ```
 */
type WrappedMuiComponentFactory<C extends ComponentType<any>> = (props?: NodeProps<C>) => BaseNodeInstance<C>

/**
 * Type alias for accessing Material-UI module exports.
 * Provides type-safe access to all MUI components and utilities.
 */
type MuiModule = typeof Mui

/**
 * Filters object type to only include React component entries.
 * Excludes non-component exports like utils, hooks, etc.
 * @template T - The source object type to filter
 * @returns Object type containing only component entries
 * @example
 * ```ts
 * // Gets only MUI component types, excluding utils/hooks
 * type MuiComponents = FilterComponents<typeof Mui>;
 * // Results in: { Button: ComponentType, TextField: ComponentType, ... }
 * ```
 */
type FilterComponents<T> = {
  [K in keyof T as T[K] extends ComponentType<any> ? K : never]: T[K]
}

/**
 * Maps MUI components to their corresponding factory functions.
 * Preserves type safety and prop types of original components.
 * @remarks
 * - Filters to only include valid React components
 * - Creates factory functions that accept component props
 * - Maintains original prop types and constraints
 * - Supports theme context and direct CSS props
 * @example
 * ```ts
 * // Type definition includes all component factories:
 * type Factories = {
 *   Button: (props?: ButtonProps) => BaseNodeInstance<typeof Button>;
 *   TextField: (props?: TextFieldProps) => BaseNodeInstance<typeof TextField>;
 *   // ...etc
 * }
 * ```
 */
type MuiNodeFactoriesType = {
  [K in keyof FilterComponents<MuiModule>]: WrappedMuiComponentFactory<FilterComponents<MuiModule>[K]>
}

/**
 * Internal map storing generated component factories.
 * Populated during initialization with wrapped versions of MUI components.
 * @internal
 * Properties are made optional and mutable to allow dynamic population.
 * The external API freezes this object for immutability.
 */
const muiNodeFactoriesInternal: {
  -readonly [K in keyof MuiNodeFactoriesType]?: MuiNodeFactoriesType[K]
} = {}

/**
 * Determines if an object is likely to be a Material-UI theme object by comparing its structure
 * to a reference theme.
 * @param obj The object to evaluate as a potential MUI theme
 * @returns `true` if the object appears to be a MUI theme, `false` otherwise
 * @remarks
 * The function uses a heuristic approach by:
 * 1. Creating a reference theme using MUI's extendTheme()
 * 2. Comparing the keys of the input object with the reference theme
 * 3. Calculating a similarity score based on matching keys
 * 4. Considering it a theme if at least 25% of reference keys are present
 * @example
 * ```ts
 * const customTheme = {
 *   palette: { primary: { main: '#000' } },
 *   typography: { fontSize: 14 }
 * };
 *
 * if (isProbablyMuiTheme(customTheme)) {
 *   // Handle theme object
 * }
 * ```
 * @throws Will not throw, but returns false for null, non-objects, or invalid inputs
 */
export function isProbablyMuiTheme(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false

  const referenceTheme = Mui.extendTheme()
  const themeKeys = Object.keys(referenceTheme)
  const objKeys = Object.keys(obj as object)

  const commonKeys = objKeys.filter(key => themeKeys.includes(key))
  const similarity = commonKeys.length / themeKeys.length

  return similarity >= 0.25
}

/**
 * Dynamically generates wrapped factory functions for each valid Material-UI component.
 * @remarks
 * The initialization process:
 * 1. Iterates through all MUI module exports
 * 2. Validates each export to ensure it's a renderable React component using isRenderableMuiComponent()
 * 3. Creates a strongly-typed factory function that wraps the component with Node()
 * 4. Stores factory functions in muiNodeFactoriesInternal map for later export
 *
 * Each generated factory function:
 * - Preserves full TypeScript typing from the original MUI component
 * - Accepts an optional props object that combines:
 *   - All original MUI component props
 *   - Direct CSS properties (without needing sx prop)
 *   - Common React props like children, key, etc
 *   - Theme context access
 * - Returns a BaseNodeInstance that can be rendered to React elements
 * @example
 * ```ts
 * // Original MUI Button becomes a factory function:
 * const button = muiNodeFactoriesInternal.Button({
 *   variant: 'contained', // MUI prop
 *   backgroundColor: 'blue', // Direct CSS prop
 *   children: 'Click Me', // React prop
 *   theme: customTheme // Theme context
 * });
 * ```
 * @see isRenderableMuiComponent - For component validation logic
 * @see NodeProps - For supported prop types
 * @see BaseNodeInstance - For node instance structure
 * @see Node - For the wrapping function implementation
 */
const MergedMuiComponents = { ...Mui, ...MuiStyles } as MuiModule
const componentKeys = Object.keys(Mui) as Array<keyof MuiModule>
for (const componentName of componentKeys) {
  const OriginalComponentCandidate = MergedMuiComponents[componentName]

  if (isRenderableMuiComponent(OriginalComponentCandidate, componentName)) {
    type RenderableComponentName = keyof FilterComponents<MuiModule>

    muiNodeFactoriesInternal[componentName as unknown as RenderableComponentName] = <T extends NodeElement>(
      props: NodeProps<T> = {} as NodeProps<T>,
    ): BaseNodeInstance<T> => {
      if (!isProbablyMuiTheme(props.theme)) {
        ;(props as RawNodeProps<T>).nodeTheme = props.theme
        delete props.theme
      }
      return Node(OriginalComponentCandidate, props as RawNodeProps<T>) as BaseNodeInstance<T>
    }
  }
}

/**
 * Factory object containing all wrapped MUI component factories.
 * Internal object that provides type-safe access to wrapped versions of MUI components.
 * Used to generate the individual exports.
 * @internal
 */
const MuiNodeFactories = Object.freeze(muiNodeFactoriesInternal) as MuiNodeFactoriesType

/**
 * Export Material-UI component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */
export const Accordion = MuiNodeFactories.Accordion
export const AccordionActions = MuiNodeFactories.AccordionActions
export const AccordionDetails = MuiNodeFactories.AccordionDetails
export const AccordionSummary = MuiNodeFactories.AccordionSummary
export const Alert = MuiNodeFactories.Alert
export const AlertTitle = MuiNodeFactories.AlertTitle
export const AppBar = MuiNodeFactories.AppBar
export const Autocomplete = MuiNodeFactories.Autocomplete
export const Avatar = MuiNodeFactories.Avatar
export const AvatarGroup = MuiNodeFactories.AvatarGroup
export const Backdrop = MuiNodeFactories.Backdrop
export const Badge = MuiNodeFactories.Badge
export const BottomNavigation = MuiNodeFactories.BottomNavigation
export const BottomNavigationAction = MuiNodeFactories.BottomNavigationAction
export const Box = MuiNodeFactories.Box
export const Breadcrumbs = MuiNodeFactories.Breadcrumbs
export const Button = MuiNodeFactories.Button
export const ButtonBase = MuiNodeFactories.ButtonBase
export const ButtonGroup = MuiNodeFactories.ButtonGroup
export const Card = MuiNodeFactories.Card
export const CardActionArea = MuiNodeFactories.CardActionArea
export const CardActions = MuiNodeFactories.CardActions
export const CardContent = MuiNodeFactories.CardContent
export const CardHeader = MuiNodeFactories.CardHeader
export const CardMedia = MuiNodeFactories.CardMedia
export const Checkbox = MuiNodeFactories.Checkbox
export const Chip = MuiNodeFactories.Chip
export const CircularProgress = MuiNodeFactories.CircularProgress
export const Collapse = MuiNodeFactories.Collapse
export const Container = MuiNodeFactories.Container
export const CssBaseline = MuiNodeFactories.CssBaseline
export const Dialog = MuiNodeFactories.Dialog
export const DialogActions = MuiNodeFactories.DialogActions
export const DialogContent = MuiNodeFactories.DialogContent
export const DialogContentText = MuiNodeFactories.DialogContentText
export const DialogTitle = MuiNodeFactories.DialogTitle
export const Divider = MuiNodeFactories.Divider
export const Drawer = MuiNodeFactories.Drawer
export const Fab = MuiNodeFactories.Fab
export const Fade = MuiNodeFactories.Fade
export const FilledInput = MuiNodeFactories.FilledInput
export const FormControl = MuiNodeFactories.FormControl
export const FormControlLabel = MuiNodeFactories.FormControlLabel
export const FormGroup = MuiNodeFactories.FormGroup
export const FormHelperText = MuiNodeFactories.FormHelperText
export const FormLabel = MuiNodeFactories.FormLabel
export const Grid = MuiNodeFactories.Grid
export const Grow = MuiNodeFactories.Grow
export const Icon = MuiNodeFactories.Icon
export const IconButton = MuiNodeFactories.IconButton
export const ImageList = MuiNodeFactories.ImageList
export const ImageListItem = MuiNodeFactories.ImageListItem
export const ImageListItemBar = MuiNodeFactories.ImageListItemBar
export const Input = MuiNodeFactories.Input
export const InputAdornment = MuiNodeFactories.InputAdornment
export const InputBase = MuiNodeFactories.InputBase
export const InputLabel = MuiNodeFactories.InputLabel
export const LinearProgress = MuiNodeFactories.LinearProgress
export const Link = MuiNodeFactories.Link
export const List = MuiNodeFactories.List
export const ListItem = MuiNodeFactories.ListItem
export const ListItemAvatar = MuiNodeFactories.ListItemAvatar
export const ListItemButton = MuiNodeFactories.ListItemButton
export const ListItemIcon = MuiNodeFactories.ListItemIcon
export const ListItemSecondaryAction = MuiNodeFactories.ListItemSecondaryAction
export const ListItemText = MuiNodeFactories.ListItemText
export const ListSubheader = MuiNodeFactories.ListSubheader
export const Menu = MuiNodeFactories.Menu
export const MenuItem = MuiNodeFactories.MenuItem
export const MenuList = MuiNodeFactories.MenuList
export const MobileStepper = MuiNodeFactories.MobileStepper
export const Modal = MuiNodeFactories.Modal
export const NativeSelect = MuiNodeFactories.NativeSelect
export const OutlinedInput = MuiNodeFactories.OutlinedInput
export const Pagination = MuiNodeFactories.Pagination
export const PaginationItem = MuiNodeFactories.PaginationItem
export const Paper = MuiNodeFactories.Paper
export const Popover = MuiNodeFactories.Popover
export const Popper = MuiNodeFactories.Popper
export const Radio = MuiNodeFactories.Radio
export const RadioGroup = MuiNodeFactories.RadioGroup
export const Rating = MuiNodeFactories.Rating
export const ScopedCssBaseline = MuiNodeFactories.ScopedCssBaseline
export const Select = MuiNodeFactories.Select
export const Skeleton = MuiNodeFactories.Skeleton
export const Slide = MuiNodeFactories.Slide
export const Slider = MuiNodeFactories.Slider
export const Snackbar = MuiNodeFactories.Snackbar
export const SnackbarContent = MuiNodeFactories.SnackbarContent
export const SpeedDial = MuiNodeFactories.SpeedDial
export const SpeedDialAction = MuiNodeFactories.SpeedDialAction
export const SpeedDialIcon = MuiNodeFactories.SpeedDialIcon
export const Stack = MuiNodeFactories.Stack
export const Step = MuiNodeFactories.Step
export const StepButton = MuiNodeFactories.StepButton
export const StepConnector = MuiNodeFactories.StepConnector
export const StepContent = MuiNodeFactories.StepContent
export const StepIcon = MuiNodeFactories.StepIcon
export const StepLabel = MuiNodeFactories.StepLabel
export const Stepper = MuiNodeFactories.Stepper
export const SvgIcon = MuiNodeFactories.SvgIcon
export const SwipeableDrawer = MuiNodeFactories.SwipeableDrawer
export const Switch = MuiNodeFactories.Switch
export const Tab = MuiNodeFactories.Tab
export const Table = MuiNodeFactories.Table
export const TableBody = MuiNodeFactories.TableBody
export const TableCell = MuiNodeFactories.TableCell
export const TableContainer = MuiNodeFactories.TableContainer
export const TableFooter = MuiNodeFactories.TableFooter
export const TableHead = MuiNodeFactories.TableHead
export const TablePagination = MuiNodeFactories.TablePagination
export const TableRow = MuiNodeFactories.TableRow
export const TableSortLabel = MuiNodeFactories.TableSortLabel
export const Tabs = MuiNodeFactories.Tabs
export const TextField = MuiNodeFactories.TextField
export const TextareaAutosize = MuiNodeFactories.TextareaAutosize
export const ThemeProvider = MuiNodeFactories.ThemeProvider
export const ToggleButton = MuiNodeFactories.ToggleButton
export const ToggleButtonGroup = MuiNodeFactories.ToggleButtonGroup
export const Toolbar = MuiNodeFactories.Toolbar
export const Tooltip = MuiNodeFactories.Tooltip
export const Typography = MuiNodeFactories.Typography
export const Zoom = MuiNodeFactories.Zoom
