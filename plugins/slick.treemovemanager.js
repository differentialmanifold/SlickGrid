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

        function moveItem(targetItem, treeItem, moveType) {
            var rowsToDrag = getRowsToDrag(treeItem);

            _dataView.beginUpdate();
            var i;
            for (i = 0; i < rowsToDrag.length; i++) {
                _dataView.deleteItem(rowsToDrag[i].id);
            }

            var diff = targetItem.indent - treeItem.indent;

            var idx = _dataView.getIdxById(targetItem.id);

            treeItem.parent = targetItem.parent;
            for (i = 0; i < rowsToDrag.length; i++) {
                rowsToDrag[i].indent = rowsToDrag[i].indent + diff;
                _dataView.insertItem(idx + i, rowsToDrag[i]);
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
            dd.rowsToDrag = getRowsToDrag(item);

            var selectedRows = _grid.getSelectedRows();

            if (selectedRows.length == 0 || $.inArray(cell.row, selectedRows) == -1) {
                selectedRows = [cell.row];
                _grid.setSelectedRows(selectedRows);
            }

            var rowHeight = _grid.getOptions().rowHeight;

            dd.selectedRows = selectedRows;

            dd.selectionProxy = $("<div class='slick-reorder-proxy'/>")
                .css("position", "absolute")
                .css("zIndex", "99999")
                .css("width", $(_canvas).innerWidth())
                .css("height", rowHeight * selectedRows.length)
                .appendTo(_canvas);

            dd.guide = $("<div class='slick-reorder-guide'/>")
                .css("position", "absolute")
                .css("zIndex", "99998")
                .css("width", $(_canvas).innerWidth())
                .css("top", -1000)
                .appendTo(_canvas);

            dd.insertBefore = -1;
        }

        function handleDrag(e, dd) {
            if (!_dragging) {
                return;
            }

            e.stopImmediatePropagation();

            var top = e.pageY - $(_canvas).offset().top;
            dd.selectionProxy.css("top", top - 5);

            var insertBefore = Math.max(0, Math.min(Math.round(top / _grid.getOptions().rowHeight), _grid.getDataLength()));
            if (insertBefore !== dd.insertBefore) {
                var eventData = {
                    "rows": dd.selectedRows,
                    "insertBefore": insertBefore
                };

                if (_self.onBeforeMoveRows.notify(eventData) === false) {
                    dd.guide.css("top", -1000);
                    dd.canMove = false;
                } else {
                    dd.guide.css("top", insertBefore * _grid.getOptions().rowHeight);
                    dd.canMove = true;
                }

                dd.insertBefore = insertBefore;
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
                    "rows": dd.selectedRows,
                    "insertBefore": dd.insertBefore,
                    "rowsToDrag": dd.rowsToDrag
                };
                // TODO:  _grid.remapCellCssClasses ?
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