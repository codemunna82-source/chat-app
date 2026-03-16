'use client';

import { List, useListRef } from 'react-window';
import { forwardRef, useImperativeHandle } from 'react';

export const FixedSizeList = forwardRef((props: any, ref: any) => {
  // useListRef returns a ref object (like useRef), NOT a [value, setter] tuple
  const internalRef = useListRef(null);

  // Expose a scrollToItem method on the forwarded ref that maps to scrollToRow
  useImperativeHandle(ref, () => ({
    scrollToItem: (index: number, align: string = 'auto') => {
      if (internalRef.current) {
        internalRef.current.scrollToRow({ index, align: align as any });
      }
    },
  }), [internalRef]);

  // Wrap the children render function into a rowComponent
  const RowComponent = props.children;

  return (
    <List
      rowCount={props.itemCount}
      rowHeight={props.itemSize}
      rowComponent={RowComponent}
      rowProps={{}}
      onRowsRendered={(rendered: any, overscan: any) => {
        if (props.onItemsRendered) {
          props.onItemsRendered({
            visibleStartIndex: rendered.startIndex,
            visibleStopIndex: rendered.stopIndex,
            overscanStartIndex: overscan?.startIndex ?? rendered.startIndex,
            overscanStopIndex: overscan?.stopIndex ?? rendered.stopIndex,
          });
        }
      }}
      listRef={internalRef}
      style={{ height: props.height, width: props.width, ...props.style }}
      overscanCount={props.overscanCount}
    />
  );
});

FixedSizeList.displayName = 'FixedSizeList';

export type ListOnItemsRenderedProps = {
  visibleStartIndex: number;
  visibleStopIndex: number;
  overscanStartIndex: number;
  overscanStopIndex: number;
};
