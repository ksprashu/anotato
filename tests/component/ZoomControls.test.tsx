import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomControls, getNextZoomIn, getNextZoomOut, ZOOM_PRESETS } from '../../src/components/toolbar/ZoomControls';
import { AppProvider } from '../../src/state/AppContext';
import { BaseImage } from '../../src/types';

const mockImage: BaseImage = {
  id: 'img_test_1',
  src: 'blob:mock-image-url',
  naturalWidth: 1600,
  naturalHeight: 900,
  fileName: 'test-screenshot.png',
  fileSize: 102400,
};

describe('ZoomControls Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pure Mathematical Stepping Functions', () => {
    it('defines exactly 10 strictly increasing presets matching the project contract', () => {
      expect(ZOOM_PRESETS).toHaveLength(10);
      expect(ZOOM_PRESETS).toEqual([0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00]);
      for (let i = 1; i < ZOOM_PRESETS.length; i++) {
        expect(ZOOM_PRESETS[i]).toBeGreaterThan(ZOOM_PRESETS[i - 1]);
      }
    });

    it('steps through full 10-preset ladder monotonically on zoom in', () => {
      const expectedLadder = [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00];
      for (let i = 0; i < expectedLadder.length - 1; i++) {
        expect(getNextZoomIn(expectedLadder[i])).toBe(expectedLadder[i + 1]);
      }
      expect(getNextZoomIn(20.0)).toBe(20.0);
    });

    it('steps through full 10-preset ladder monotonically on zoom out', () => {
      const expectedLadder = [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00];
      for (let i = expectedLadder.length - 1; i > 0; i--) {
        expect(getNextZoomOut(expectedLadder[i])).toBe(expectedLadder[i - 1]);
      }
      expect(getNextZoomOut(0.05)).toBe(0.05);
    });
  });

  describe('Rendering & Default States', () => {
    it('renders zoom toolbar with all controls and initial 100% level', () => {
      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 1.0, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );

      expect(screen.getByTestId('zoom-controls-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-out-btn')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-in-btn')).toBeInTheDocument();
      expect(screen.getByTestId('fit-screen-btn')).toBeInTheDocument();
      expect(screen.getByTestId('actual-size-btn')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-level-dropdown-btn')).toHaveTextContent('100%');
    });

    it('disables all zoom controls when no image is loaded', () => {
      render(
        <AppProvider initialState={{ image: null }}>
          <ZoomControls />
        </AppProvider>
      );

      expect(screen.getByTestId('zoom-out-btn')).toBeDisabled();
      expect(screen.getByTestId('zoom-in-btn')).toBeDisabled();
      expect(screen.getByTestId('fit-screen-btn')).toBeDisabled();
      expect(screen.getByTestId('actual-size-btn')).toBeDisabled();
      expect(screen.getByTestId('zoom-level-dropdown-btn')).toBeDisabled();
    });

    it('displays formatted zoom percentages correctly (e.g. 50%, 150%, 200%)', () => {
      const { unmount } = render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 0.5, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );
      expect(screen.getByTestId('zoom-level-dropdown-btn')).toHaveTextContent('50%');
      unmount();

      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 1.5, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );
      expect(screen.getByTestId('zoom-level-dropdown-btn')).toHaveTextContent('150%');
    });
  });

  describe('Interactive Zoom Actions & Callbacks', () => {
    it('invokes custom onZoomIn callback when Zoom In button is clicked', async () => {
      const user = userEvent.setup();
      const onZoomInMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ZoomControls onZoomIn={onZoomInMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('zoom-in-btn'));
      expect(onZoomInMock).toHaveBeenCalledTimes(1);
    });

    it('invokes custom onZoomOut callback when Zoom Out button is clicked', async () => {
      const user = userEvent.setup();
      const onZoomOutMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ZoomControls onZoomOut={onZoomOutMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('zoom-out-btn'));
      expect(onZoomOutMock).toHaveBeenCalledTimes(1);
    });

    it('invokes custom onFitToScreen callback when Fit to Screen button is clicked', async () => {
      const user = userEvent.setup();
      const onFitMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ZoomControls onFitToScreen={onFitMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('fit-screen-btn'));
      expect(onFitMock).toHaveBeenCalledTimes(1);
    });

    it('invokes custom onActualSize callback when 1:1 button is clicked', async () => {
      const user = userEvent.setup();
      const onActualSizeMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ZoomControls onActualSize={onActualSizeMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('actual-size-btn'));
      expect(onActualSizeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Preset Menu Dropdown', () => {
    it('toggles preset dropdown menu and renders all 10 presets without obsolete items', async () => {
      const user = userEvent.setup();

      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 1.0, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );

      expect(screen.queryByTestId('zoom-preset-menu')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));
      expect(screen.getByTestId('zoom-preset-menu')).toBeInTheDocument();

      // Verify all 10 presets are present
      const allPresetValues = [10, 25, 33, 50, 67, 75, 100, 125, 150, 200];
      for (const val of allPresetValues) {
        expect(screen.getByTestId(`zoom-preset-${val}`)).toBeInTheDocument();
      }

      // Verify obsolete presets (like 400%) are omitted
      expect(screen.queryByTestId('zoom-preset-400')).not.toBeInTheDocument();

      expect(screen.getByTestId('zoom-menu-fit-to-screen')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-menu-actual-size')).toBeInTheDocument();
    });

    it('invokes onSetZoom callback across low, mid, and high presets', async () => {
      const user = userEvent.setup();
      const onSetZoomMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ZoomControls onSetZoom={onSetZoomMock} />
        </AppProvider>
      );

      // Low preset (10%)
      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));
      await user.click(screen.getByTestId('zoom-preset-10'));
      expect(onSetZoomMock).toHaveBeenCalledWith(0.10);

      // Mid preset (67%)
      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));
      await user.click(screen.getByTestId('zoom-preset-67'));
      expect(onSetZoomMock).toHaveBeenCalledWith(0.67);

      // High preset (200%)
      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));
      await user.click(screen.getByTestId('zoom-preset-200'));
      expect(onSetZoomMock).toHaveBeenCalledWith(2.0);

      expect(screen.queryByTestId('zoom-preset-menu')).not.toBeInTheDocument();
    });

    it('applies amber active highlight to the currently matching preset', async () => {
      const user = userEvent.setup();

      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 0.67, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );

      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));

      const activeBtn = screen.getByTestId('zoom-preset-67');
      const inactiveBtn = screen.getByTestId('zoom-preset-100');

      expect(activeBtn.className).toContain('text-amber-600');
      expect(inactiveBtn.className).not.toContain('text-amber-600');
    });

    it('dismisses preset dropdown when clicking outside', async () => {
      const user = userEvent.setup();

      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 1.0, panX: 0, panY: 0 } }}>
          <div data-testid="outside-element">Outside</div>
          <ZoomControls />
        </AppProvider>
      );

      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));
      expect(screen.getByTestId('zoom-preset-menu')).toBeInTheDocument();

      await user.click(screen.getByTestId('outside-element'));
      expect(screen.queryByTestId('zoom-preset-menu')).not.toBeInTheDocument();
    });
  });

  describe('Boundary Conditions', () => {
    it('disables Zoom Out button when reaching MIN_ZOOM (0.05 / 5%)', () => {
      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 0.05, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );

      expect(screen.getByTestId('zoom-out-btn')).toBeDisabled();
      expect(screen.getByTestId('zoom-in-btn')).not.toBeDisabled();
    });

    it('disables Zoom In button when reaching MAX_ZOOM (20.0 / 2000%)', () => {
      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 20.0, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );

      expect(screen.getByTestId('zoom-in-btn')).toBeDisabled();
      expect(screen.getByTestId('zoom-out-btn')).not.toBeDisabled();
    });
  });
});
