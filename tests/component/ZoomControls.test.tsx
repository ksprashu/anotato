import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomControls, getNextZoomIn, getNextZoomOut } from '../../src/components/toolbar/ZoomControls';
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
    it('calculates discrete next zoom in step correctly', () => {
      expect(getNextZoomIn(0.5)).toBe(0.67);
      expect(getNextZoomIn(1.0)).toBe(1.25);
      expect(getNextZoomIn(1.25)).toBe(1.5);
      expect(getNextZoomIn(20.0)).toBe(20.0);
    });

    it('calculates discrete next zoom out step correctly', () => {
      expect(getNextZoomOut(1.0)).toBe(0.75);
      expect(getNextZoomOut(0.75)).toBe(0.67);
      expect(getNextZoomOut(0.5)).toBe(0.33);
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
    it('toggles preset dropdown menu on clicking zoom percentage', async () => {
      const user = userEvent.setup();

      render(
        <AppProvider initialState={{ image: mockImage, viewport: { zoom: 1.0, panX: 0, panY: 0 } }}>
          <ZoomControls />
        </AppProvider>
      );

      expect(screen.queryByTestId('zoom-preset-menu')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));
      expect(screen.getByTestId('zoom-preset-menu')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-preset-50')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-preset-100')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-preset-200')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-menu-fit-to-screen')).toBeInTheDocument();
      expect(screen.getByTestId('zoom-menu-actual-size')).toBeInTheDocument();
    });

    it('invokes onSetZoom callback when preset is selected from dropdown', async () => {
      const user = userEvent.setup();
      const onSetZoomMock = vi.fn();

      render(
        <AppProvider initialState={{ image: mockImage }}>
          <ZoomControls onSetZoom={onSetZoomMock} />
        </AppProvider>
      );

      await user.click(screen.getByTestId('zoom-level-dropdown-btn'));
      await user.click(screen.getByTestId('zoom-preset-200'));

      expect(onSetZoomMock).toHaveBeenCalledWith(2.0);
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
