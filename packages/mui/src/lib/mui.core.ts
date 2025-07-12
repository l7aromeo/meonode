import createMuiNode from '@src/core'
import {
  Accordion as MuiAccordion,
  AccordionActions as MuiAccordionActions,
  AccordionDetails as MuiAccordionDetails,
  AccordionSummary as MuiAccordionSummary,
  Alert as MuiAlert,
  AlertTitle as MuiAlertTitle,
  AppBar as MuiAppBar,
  Autocomplete as MuiAutocomplete,
  Avatar as MuiAvatar,
  AvatarGroup as MuiAvatarGroup,
  Backdrop as MuiBackdrop,
  Badge as MuiBadge,
  BottomNavigation as MuiBottomNavigation,
  BottomNavigationAction as MuiBottomNavigationAction,
  Box as MuiBox,
  Breadcrumbs as MuiBreadcrumbs,
  Button as MuiButton,
  ButtonBase as MuiButtonBase,
  ButtonGroup as MuiButtonGroup,
  Card as MuiCard,
  CardActionArea as MuiCardActionArea,
  CardActions as MuiCardActions,
  CardContent as MuiCardContent,
  CardHeader as MuiCardHeader,
  CardMedia as MuiCardMedia,
  Checkbox as MuiCheckbox,
  Chip as MuiChip,
  CircularProgress as MuiCircularProgress,
  Collapse as MuiCollapse,
  Container as MuiContainer,
  CssBaseline as MuiCssBaseline,
  Dialog as MuiDialog,
  DialogActions as MuiDialogActions,
  DialogContent as MuiDialogContent,
  DialogContentText as MuiDialogContentText,
  DialogTitle as MuiDialogTitle,
  Divider as MuiDivider,
  Drawer as MuiDrawer,
  Fab as MuiFab,
  Fade as MuiFade,
  FilledInput as MuiFilledInput,
  FormControl as MuiFormControl,
  FormControlLabel as MuiFormControlLabel,
  FormGroup as MuiFormGroup,
  FormHelperText as MuiFormHelperText,
  FormLabel as MuiFormLabel,
  Grid as MuiGrid,
  Grow as MuiGrow,
  Icon as MuiIcon,
  IconButton as MuiIconButton,
  ImageList as MuiImageList,
  ImageListItem as MuiImageListItem,
  ImageListItemBar as MuiImageListItemBar,
  Input as MuiInput,
  InputAdornment as MuiInputAdornment,
  InputBase as MuiInputBase,
  InputLabel as MuiInputLabel,
  LinearProgress as MuiLinearProgress,
  Link as MuiLink,
  List as MuiList,
  ListItem as MuiListItem,
  ListItemAvatar as MuiListItemAvatar,
  ListItemButton as MuiListItemButton,
  ListItemIcon as MuiListItemIcon,
  ListItemText as MuiListItemText,
  ListSubheader as MuiListSubheader,
  Menu as MuiMenu,
  MenuItem as MuiMenuItem,
  MenuList as MuiMenuList,
  MobileStepper as MuiMobileStepper,
  Modal as MuiModal,
  NativeSelect as MuiNativeSelect,
  OutlinedInput as MuiOutlinedInput,
  Pagination as MuiPagination,
  PaginationItem as MuiPaginationItem,
  Paper as MuiPaper,
  Popover as MuiPopover,
  Popper as MuiPopper,
  Portal as MuiPortal,
  Radio as MuiRadio,
  RadioGroup as MuiRadioGroup,
  Rating as MuiRating,
  ScopedCssBaseline as MuiScopedCssBaseline,
  Select as MuiSelect,
  Skeleton as MuiSkeleton,
  Slide as MuiSlide,
  Slider as MuiSlider,
  Snackbar as MuiSnackbar,
  SnackbarContent as MuiSnackbarContent,
  SpeedDial as MuiSpeedDial,
  SpeedDialAction as MuiSpeedDialAction,
  SpeedDialIcon as MuiSpeedDialIcon,
  Stack as MuiStack,
  Step as MuiStep,
  StepButton as MuiStepButton,
  StepConnector as MuiStepConnector,
  StepContent as MuiStepContent,
  StepIcon as MuiStepIcon,
  StepLabel as MuiStepLabel,
  Stepper as MuiStepper,
  SvgIcon as MuiSvgIcon,
  SwipeableDrawer as MuiSwipeableDrawer,
  Switch as MuiSwitch,
  Tab as MuiTab,
  TabScrollButton as MuiTabScrollButton,
  Table as MuiTable,
  TableBody as MuiTableBody,
  TableCell as MuiTableCell,
  TableContainer as MuiTableContainer,
  TableFooter as MuiTableFooter,
  TableHead as MuiTableHead,
  TablePagination as MuiTablePagination,
  TableRow as MuiTableRow,
  TableSortLabel as MuiTableSortLabel,
  Tabs as MuiTabs,
  TextField as MuiTextField,
  TextareaAutosize as MuiTextareaAutosize,
  ThemeProvider as MuiThemeProvider,
  ToggleButton as MuiToggleButton,
  ToggleButtonGroup as MuiToggleButtonGroup,
  Toolbar as MuiToolbar,
  Tooltip as MuiTooltip,
  Typography as MuiTypography,
  Zoom as MuiZoom,
} from '@mui/material'
import { OverridableComponent } from '@mui/material/OverridableComponent'
import { BoxTypeMap } from '@mui/system'

/**
 * Export Material-UI component factories with enhanced type-safety and prop validation.
 * Each export is a factory function that wraps the original MUI component, providing:
 * - Full TypeScript type checking for component props
 * - Direct CSS property support without requiring sx prop
 * - Theme context access and inheritance
 * - Proper component validation and error handling
 */
export const Accordion = createMuiNode(MuiAccordion)
export const AccordionActions = createMuiNode(MuiAccordionActions)
export const AccordionDetails = createMuiNode(MuiAccordionDetails)
export const AccordionSummary = createMuiNode(MuiAccordionSummary)
export const Alert = createMuiNode(MuiAlert)
export const AlertTitle = createMuiNode(MuiAlertTitle)
export const AppBar = createMuiNode(MuiAppBar)
export const Autocomplete = createMuiNode(MuiAutocomplete)
export const Avatar = createMuiNode(MuiAvatar)
export const AvatarGroup = createMuiNode(MuiAvatarGroup)
export const Backdrop = createMuiNode(MuiBackdrop)
export const Badge = createMuiNode(MuiBadge)
export const BottomNavigation = createMuiNode(MuiBottomNavigation)
export const BottomNavigationAction = createMuiNode(MuiBottomNavigationAction)
export const Box = createMuiNode(MuiBox as OverridableComponent<BoxTypeMap>)
export const Breadcrumbs = createMuiNode(MuiBreadcrumbs)
export const Button = createMuiNode(MuiButton)
export const ButtonBase = createMuiNode(MuiButtonBase)
export const ButtonGroup = createMuiNode(MuiButtonGroup)
export const Card = createMuiNode(MuiCard)
export const CardActionArea = createMuiNode(MuiCardActionArea)
export const CardActions = createMuiNode(MuiCardActions)
export const CardContent = createMuiNode(MuiCardContent)
export const CardHeader = createMuiNode(MuiCardHeader)
export const CardMedia = createMuiNode(MuiCardMedia)
export const Checkbox = createMuiNode(MuiCheckbox)
export const Chip = createMuiNode(MuiChip)
export const CircularProgress = createMuiNode(MuiCircularProgress)
export const Collapse = createMuiNode(MuiCollapse)
export const Container = createMuiNode(MuiContainer)
export const CssBaseline = createMuiNode(MuiCssBaseline)
export const Dialog = createMuiNode(MuiDialog)
export const DialogActions = createMuiNode(MuiDialogActions)
export const DialogContent = createMuiNode(MuiDialogContent)
export const DialogContentText = createMuiNode(MuiDialogContentText)
export const DialogTitle = createMuiNode(MuiDialogTitle)
export const Divider = createMuiNode(MuiDivider)
export const Drawer = createMuiNode(MuiDrawer)
export const Fab = createMuiNode(MuiFab)
export const Fade = createMuiNode(MuiFade)
export const FilledInput = createMuiNode(MuiFilledInput)
export const FormControl = createMuiNode(MuiFormControl)
export const FormControlLabel = createMuiNode(MuiFormControlLabel)
export const FormGroup = createMuiNode(MuiFormGroup)
export const FormHelperText = createMuiNode(MuiFormHelperText)
export const FormLabel = createMuiNode(MuiFormLabel)
export const Grid = createMuiNode(MuiGrid)
export const Grow = createMuiNode(MuiGrow)
export const Icon = createMuiNode(MuiIcon)
export const IconButton = createMuiNode(MuiIconButton)
export const ImageList = createMuiNode(MuiImageList)
export const ImageListItem = createMuiNode(MuiImageListItem)
export const ImageListItemBar = createMuiNode(MuiImageListItemBar)
export const Input = createMuiNode(MuiInput)
export const InputAdornment = createMuiNode(MuiInputAdornment)
export const InputBase = createMuiNode(MuiInputBase)
export const InputLabel = createMuiNode(MuiInputLabel)
export const LinearProgress = createMuiNode(MuiLinearProgress)
export const Link = createMuiNode(MuiLink)
export const List = createMuiNode(MuiList)
export const ListItem = createMuiNode(MuiListItem)
export const ListItemAvatar = createMuiNode(MuiListItemAvatar)
export const ListItemButton = createMuiNode(MuiListItemButton)
export const ListItemIcon = createMuiNode(MuiListItemIcon)
export const ListItemText = createMuiNode(MuiListItemText)
export const ListSubheader = createMuiNode(MuiListSubheader)
export const Menu = createMuiNode(MuiMenu)
export const MenuItem = createMuiNode(MuiMenuItem)
export const MenuList = createMuiNode(MuiMenuList)
export const MobileStepper = createMuiNode(MuiMobileStepper)
export const Modal = createMuiNode(MuiModal)
export const NativeSelect = createMuiNode(MuiNativeSelect)
export const OutlinedInput = createMuiNode(MuiOutlinedInput)
export const Pagination = createMuiNode(MuiPagination)
export const PaginationItem = createMuiNode(MuiPaginationItem)
export const Paper = createMuiNode(MuiPaper)
export const Popover = createMuiNode(MuiPopover)
export const Popper = createMuiNode(MuiPopper)
export const Portal = createMuiNode(MuiPortal)
export const Radio = createMuiNode(MuiRadio)
export const RadioGroup = createMuiNode(MuiRadioGroup)
export const Rating = createMuiNode(MuiRating)
export const ScopedCssBaseline = createMuiNode(MuiScopedCssBaseline)
export const Select = createMuiNode(MuiSelect)
export const Skeleton = createMuiNode(MuiSkeleton)
export const Slide = createMuiNode(MuiSlide)
export const Slider = createMuiNode(MuiSlider)
export const Snackbar = createMuiNode(MuiSnackbar)
export const SnackbarContent = createMuiNode(MuiSnackbarContent)
export const SpeedDial = createMuiNode(MuiSpeedDial)
export const SpeedDialAction = createMuiNode(MuiSpeedDialAction)
export const SpeedDialIcon = createMuiNode(MuiSpeedDialIcon)
export const Stack = createMuiNode(MuiStack)
export const Step = createMuiNode(MuiStep)
export const StepButton = createMuiNode(MuiStepButton)
export const StepConnector = createMuiNode(MuiStepConnector)
export const StepContent = createMuiNode(MuiStepContent)
export const StepIcon = createMuiNode(MuiStepIcon)
export const StepLabel = createMuiNode(MuiStepLabel)
export const Stepper = createMuiNode(MuiStepper)
export const SvgIcon = createMuiNode(MuiSvgIcon)
export const SwipeableDrawer = createMuiNode(MuiSwipeableDrawer)
export const Switch = createMuiNode(MuiSwitch)
export const Tab = createMuiNode(MuiTab)
export const TabScrollButton = createMuiNode(MuiTabScrollButton)
export const Table = createMuiNode(MuiTable)
export const TableBody = createMuiNode(MuiTableBody)
export const TableCell = createMuiNode(MuiTableCell)
export const TableContainer = createMuiNode(MuiTableContainer)
export const TableFooter = createMuiNode(MuiTableFooter)
export const TableHead = createMuiNode(MuiTableHead)
export const TablePagination = createMuiNode(MuiTablePagination)
export const TableRow = createMuiNode(MuiTableRow)
export const TableSortLabel = createMuiNode(MuiTableSortLabel)
export const Tabs = createMuiNode(MuiTabs)
export const TextField = createMuiNode(MuiTextField)
export const TextareaAutosize = createMuiNode(MuiTextareaAutosize)
export const ThemeProvider = createMuiNode(MuiThemeProvider)
export const ToggleButton = createMuiNode(MuiToggleButton)
export const ToggleButtonGroup = createMuiNode(MuiToggleButtonGroup)
export const Toolbar = createMuiNode(MuiToolbar)
export const Tooltip = createMuiNode(MuiTooltip)
export const Typography = createMuiNode(MuiTypography)
export const Zoom = createMuiNode(MuiZoom)
