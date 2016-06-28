(function($) {
    // register namespace
    $.extend(true, window, {
        "Slick": {
            "RowMoveManager": RowMoveManager
        }
    });

    function RowMoveManager(options) {
        var _grid;
        var _dataView;
        var _canvas;
        var _dragging;
        var _extend;
        var _originItemId = null;
        var _self = this;
        var _handler = new Slick.EventHandler();
        var _defaults = {
            cancelEditOnDrag: false
        };

        function init(grid) {
            options = $.extend(true, {}, _defaults, options);
            _grid = grid;
            _dataView = dataView;
            _canvas = _grid.getCanvasNode();
            _handler
                .subscribe(_grid.onDragInit, handleDragInit)
                .subscribe(_grid.onDragStart, handleDragStart)
                .subscribe(_grid.onDrag, handleDrag)
                .subscribe(_grid.onDragEnd, handleDragEnd);
            _dataView.syncGridSelection(_grid, false);
        }

        function destroy() {
            _handler.unsubscribeAll();
        }

        function handleDragInit(e, dd) {
            // prevent the grid from cancelling drag'n'drop by default
            e.stopImmediatePropagation();
        }

        function getAllChildrenItems(item, callback) {
            var idx = _dataView.getIdxById(item.id);
            var allItems = _dataView.getItems();
            var idToDrag = [item.id];
            for (; idx + 1 < allItems.length && $.inArray(allItems[idx + 1].parent, idToDrag) != -1; idx++) {
                idToDrag.push(allItems[idx + 1].id);
                if (callback) {
                    if (callback(allItems[idx + 1]) === false) {
                        break;
                    }
                }
            }
            return idToDrag;
        }

        function getRowsToDrag(item) {
            var itemsToDrag = [];
            itemsToDrag.push(item);

            getAllChildrenItems(item, function(childrenItem) {
                itemsToDrag.push(childrenItem);
            });
            return itemsToDrag;
        }

        function moveItem(targetItem, dragItem, moveType) {
            var rowsToDrag = getRowsToDrag(dragItem);
            var targetRows = getRowsToDrag(targetItem);

            _dataView.beginUpdate();
            var i;
            for (i = 0; i < rowsToDrag.length; i++) {
                _dataView.deleteItem(rowsToDrag[i].id);
            }

            var diff = targetItem.indent - dragItem.indent;

            var idx = _dataView.getIdxById(targetItem.id);

            var positionToInsert;
            if (moveType === 'prev') {
                positionToInsert = idx;
                dragItem.parent = targetItem.parent;
            } else if (moveType === 'inner') {
                positionToInsert = idx + targetRows.length;
                diff = diff + 1;
                dragItem.parent = targetItem.id;
            } else if (moveType === 'next') {
                positionToInsert = idx + targetRows.length;
                dragItem.parent = targetItem.parent;
            }

            for (i = 0; i < rowsToDrag.length; i++) {
                rowsToDrag[i].indent = rowsToDrag[i].indent + diff;
                _dataView.insertItem(positionToInsert + i, rowsToDrag[i]);
            }

            _dataView.endUpdate();
        }

        function handleDragStart(e, dd) {
            var cell = _grid.getCellFromEvent(e);

            if (options.cancelEditOnDrag && _grid.getEditorLock().isActive()) {
                _grid.getEditorLock().cancelCurrentEdit();
            }

            if (_grid.getEditorLock().isActive() || !/move|selectAndMove/.test(_grid.getColumns()[cell.cell].behavior)) {
                return false;
            }

            _dragging = true;
            e.stopImmediatePropagation();

            var item = _dataView.getItem(cell.row);
            if (item) {
                if (!item._collapsed) {
                    _extend = true;
                    _originItemId = item.id;
                }
                item._collapsed = true;
                _dataView.updateItem(item.id, item);
            }

            dd.dragItem = item;

            // var selectedRows = _grid.getSelectedRows();

            // if (selectedRows.length == 0 || $.inArray(cell.row, selectedRows) == -1) {
            //     selectedRows = [cell.row];
            //     _grid.setSelectedRows(selectedRows);
            // }
            // dd.selectedRows = selectedRows;

            var rowHeight = _grid.getOptions().rowHeight;

            dd.selectionProxy = $("<div class='slick-reorder-proxy'/>")
                .css("position", "absolute")
                .css("zIndex", "99999")
                .css("width", $(_canvas).innerWidth())
                // .css("height", rowHeight * selectedRows.length)
                .css("height", rowHeight)
                .appendTo(_canvas);

            dd.guide = $("<div class='slick-reorder-guide'/>")
                .css("position", "absolute")
                .css("zIndex", "99998")
                .css("width", $(_canvas).innerWidth())
                .css("top", -1000)
                .appendTo(_canvas);
        }

        function handleDrag(e, dd) {
            if (!_dragging) {
                return;
            }

            e.stopImmediatePropagation();

            var top = e.pageY - $(_canvas).offset().top;
            dd.selectionProxy.css("top", top - 5);

            var rowHeight = _grid.getOptions().rowHeight;

            var targetRow = Math.max(0, Math.min(Math.floor(top / rowHeight), _grid.getDataLength()));

            var targetItem = _dataView.getItem(targetRow);

            var remainder = Math.max(0, Math.min(top % rowHeight, rowHeight));

            var moveType, rate = remainder / rowHeight;

            if (rate < 0.25) {
                moveType = 'prev';
            } else if (rate >= 0.25 && rate < 0.75) {
                moveType = 'inner';
            } else {
                moveType = 'next';
            }

            var canmove = true,
                guideTop = -1000;
            if (moveType === 'prev') {
                guideTop = targetRow * rowHeight + 0.1 * rowHeight;
            } else if (moveType === 'inner' && targetItem.hasChildren) {
                guideTop = targetRow * rowHeight + 0.5 * rowHeight;
            } else if (moveType === 'next') {
                guideTop = targetRow * rowHeight + 0.9 * rowHeight - $('.slick-reorder-guide').height();
            } else {
                canmove = false;
            }


            if (targetRow !== dd.targetRow || moveType !== dd.moveType) {
                var eventData = {
                    // "rows": dd.selectedRows
                };
                if (!canmove || _self.onBeforeMoveRows.notify(eventData) === false) {
                    dd.guide.css("top", -1000);
                    dd.canMove = false;
                } else {
                    dd.guide.css("top", guideTop);
                    dd.canMove = true;
                }

                dd.targetRow = targetRow;
                dd.targetItem = targetItem;
                dd.moveType = moveType;
            }
        }

        function handleDragEnd(e, dd) {
            var cell = _grid.getCellFromEvent(e);
            if (!_dragging) {
                return;
            }
            _dragging = false;
            e.stopImmediatePropagation();

            dd.guide.remove();
            dd.selectionProxy.remove();
            if (dd.canMove) {
                var eventData = {
                    // "rows": dd.selectedRows,
                    "rowsToDrag": dd.rowsToDrag
                };
                // TODO:  _grid.remapCellCssClasses ?

                moveItem(dd.targetItem, dd.dragItem, dd.moveType)
                _self.onMoveRows.notify(eventData);
            }
            if (_extend) {
                var originItem = _dataView.getItemById(_originItemId);
                originItem._collapsed = false;
                _dataView.updateItem(_originItemId, originItem);
                _extend = false;
            }
        }

        $.extend(this, {
            "onBeforeMoveRows": new Slick.Event(),
            "onMoveRows": new Slick.Event(),

            "init": init,
            "destroy": destroy,
            "getAllChildrenItems": getAllChildrenItems
        });
    }
})(jQuery);